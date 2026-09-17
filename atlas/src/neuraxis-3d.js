// 3D neuraxis view for the Neurovascular Atlas.
//
// The atlas ships 15 two-dimensional plates. Each numbered marker already
// carries a plate, a distance from the midline and a depth within the plate,
// so the plates can be stood up in space and the markers placed on them. A
// structure marked on several plates then has a course, and that course is
// the thing a flat plate cannot show: where a tract sits at one level, where
// it has moved to at the next, and which side of the midline it is on.
//
// No libraries, no network: the file has to keep working from a folder with
// no server, so this is canvas 2D with its own camera and painter's-algorithm
// sort. It reads the atlas's own data and text helpers, exported by the app
// bundle on window.__ATLAS__, so there is one copy of the anatomy.

(function () {
  'use strict';

  // @inject modules

  var HOST_ID = 'nvx3d-host';
  var atlas = null;

  // ---------------------------------------------------------------- helpers

  function el(tag, props, children) {
    var node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key === 'style') node.setAttribute('style', value);
        else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : value);
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function levelById(id) {
    return atlas.data.levels.find(function (level) { return level.id === id; }) || atlas.data.levels[0];
  }

  function regionById(id) {
    return atlas.data.regions.find(function (region) { return region.id === id; }) || null;
  }

  function regionsAt(levelId) {
    return atlas.regionsAt(levelId);
  }

  function systemColor(system) {
    return (atlas.colors && atlas.colors[system]) || '#a5c5d4';
  }

  function levelShortName(level) {
    var parts = level.name.split(' · ');
    return parts[1] || parts[0];
  }

  // Marker numbers are per plate and match the numbers printed on the 2D map.
  function markerNumber(levelId, regionId) {
    var list = regionsAt(levelId);
    for (var i = 0; i < list.length; i++) if (list[i].id === regionId) return i + 1;
    return 0;
  }

  function sidesFor(side) {
    return side === 'bilateral' ? ['left', 'right'] : [side];
  }

  // ------------------------------------------------------- outline sampling
  //
  // The plate outlines live in the bundle as SVG path strings. Rather than
  // parsing cubic and quadratic segments by hand, the browser's own path
  // implementation is asked to walk them, once per plate, and the sampled
  // points are cached.

  var samplerSvg = null;
  var samplerPath = null;
  var outlineCache = {};

  function samplePath(d, maxPoints) {
    if (!samplerSvg) {
      samplerSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      samplerSvg.setAttribute('width', '0');
      samplerSvg.setAttribute('height', '0');
      samplerSvg.setAttribute('aria-hidden', 'true');
      samplerSvg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
      samplerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      samplerSvg.appendChild(samplerPath);
      document.body.appendChild(samplerSvg);
    }
    samplerPath.setAttribute('d', d);
    var length = 0;
    try {
      length = samplerPath.getTotalLength();
    } catch (err) {
      return [];
    }
    if (!length) return [];
    var count = Math.max(24, Math.min(maxPoints || 150, Math.round(length / 9)));
    var points = [];
    for (var i = 0; i < count; i++) {
      var point = samplerPath.getPointAtLength((length * i) / count);
      points.push({ x: point.x, y: point.y });
    }
    return points;
  }

  // Plate outlines in plate coordinates, one array of points per subpath.
  function outlineFor(levelId) {
    if (outlineCache[levelId]) return outlineCache[levelId];
    var d = (atlas.outlines && atlas.outlines[levelId]) || '';
    var polys = splitSubpaths(d)
      .map(function (sub) { return samplePath(sub, 150); })
      .filter(function (points) { return points.length > 2; });
    outlineCache[levelId] = polys;
    return polys;
  }

  // The plates carry a translate(0 20) in the 2D map; markers and outlines
  // share it, so it cancels out and is ignored here.
  var worldPolyCache = {};

  function platePolysWorld(levelId, side) {
    var key = levelId + '|' + side;
    if (worldPolyCache[key]) return worldPolyCache[key];
    var polys = outlineFor(levelId).map(function (points) {
      return points.map(function (p) { return plateToWorld(levelId, p.x, p.y, side); });
    });
    worldPolyCache[key] = polys;
    return polys;
  }

  // Plate landmarks, sampled the same way the outlines are.
  var accentCache = {};

  function plateAccents(levelId) {
    if (accentCache[levelId]) return accentCache[levelId];
    var built = accentsFor(levelId).map(function (accent) {
      return {
        spec: accent,
        polys: splitSubpaths(accent.d)
          .map(function (sub) { return samplePath(sub, 90); })
          .filter(function (points) { return points.length > 1; }),
      };
    });
    accentCache[levelId] = built;
    return built;
  }

  // The point on a plate's rim where its label sits: lateral for a stacked
  // section, anterior for a surface projection.
  function labelAnchor(levelId, polys) {
    var kind = placementFor(levelId).kind;
    var best = polys[0][0];
    polys.forEach(function (poly) {
      poly.forEach(function (p) {
        if (kind === 'sagittal' ? p.y > best.y : p.x > best.x) best = p;
      });
    });
    return best;
  }

  // --------------------------------------------------------------- renderer

  var GROUPS = {
    Medulla: 'brainstem',
    Pons: 'brainstem',
    Midbrain: 'brainstem',
    Thalamus: 'forebrain',
    'Deep hemisphere': 'forebrain',
    Cortex: 'cortex',
    Cerebellum: 'cerebellum',
  };

  function groupKey(levelId) {
    return GROUPS[levelById(levelId).group] || 'brainstem';
  }

  function createRenderer(wrap, options) {
    var opts = options || {};
    var canvas = el('canvas', {
      tabindex: '0',
      role: 'img',
      'aria-label': '3D model of the atlas plates. Use the structure lists beside the model to inspect any structure without the pointer.',
    });
    var tip = el('div', { class: 'nvx3d-tip' });
    wrap.appendChild(canvas);
    wrap.appendChild(tip);

    var ctx = canvas.getContext('2d');
    var cam = makeCamera();
    var view = { cx: 0, cy: 0, zoom: 1, panX: 0, panY: 0 };
    var state = {
      focus: 'm3',
      side: 'left',
      mode: 'stack',
      tracts: 'selected',
      labels: true,
      selected: '',
      lesion: [],
      territory: [],
      spin: false,
      markerScope: 'focus',
      groups: { brainstem: true, forebrain: true, cortex: true, cerebellum: true },
    };
    var markers = [];   // projected markers from the last frame, for hit tests
    var hover = null;
    var running = true;
    var needsDraw = true;

    var reduceMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : { matches: false };

    function resize() {
      var rect = wrap.getBoundingClientRect();
      var ratio = Math.min(window.devicePixelRatio || 1, 2);
      var width = Math.max(240, Math.round(rect.width));
      var height = Math.max(240, Math.round(rect.height));
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      view.cx = width / 2;
      view.cy = height / 2;
      view.width = width;
      view.height = height;
      needsDraw = true;
    }

    // --------------------------------------------------------- scene build

    function visibleLevels() {
      return LEVEL_ORDER.filter(function (id) {
        if (!state.groups[groupKey(id)]) return false;
        if (state.mode === 'focus') {
          var focusGroup = groupKey(state.focus);
          if (id === state.focus) return true;
          // In focus mode the neighbours stay, faintly, so the focused plate
          // keeps its place in the column instead of floating alone.
          return groupKey(id) === focusGroup;
        }
        return true;
      });
    }

    function plateAlpha(levelId) {
      if (state.mode === 'focus') return levelId === state.focus ? 1 : 0.18;
      return levelId === state.focus ? 1 : 0.86;
    }

    function shouldDrawSide(levelId, side) {
      if (!isSurfaceLevel(levelId)) return true;
      // The cortical plates are single-hemisphere projections.
      return side === (state.side === 'right' ? 'right' : 'left');
    }

    function markerAlpha(side) {
      if (state.side === 'bilateral') return 1;
      return side === state.side ? 1 : 0.42;
    }

    function tractRegions() {
      if (state.tracts === 'off') return [];
      var ids;
      if (state.tracts === 'all') {
        ids = atlas.data.regions
          .filter(function (region) {
            return courseLevels(region, function (id) { return !isSurfaceLevel(id); }).length > 1;
          })
          .map(function (region) { return region.id; });
      } else {
        ids = [state.selected].concat(state.lesion, state.territory);
      }
      var seen = {};
      return ids
        .filter(function (id) {
          if (!id || seen[id]) return false;
          seen[id] = true;
          return true;
        })
        .map(regionById)
        .filter(function (region) {
          return region && courseLevels(region, function (id) { return !isSurfaceLevel(id); }).length > 1;
        });
    }

    // ------------------------------------------------------------- drawing

    function fog(depth) {
      // Distance haze: far plates sink towards the background colour.
      var t = Math.max(0, Math.min(1, (depth - cam.distance * 0.5) / (cam.distance * 1.6)));
      return 1 - t * 0.45;
    }

    function mix(hex, other, amount) {
      var a = parseInt(hex.slice(1), 16);
      var b = parseInt(other.slice(1), 16);
      var r = Math.round((a >> 16 & 255) * (1 - amount) + (b >> 16 & 255) * amount);
      var g = Math.round((a >> 8 & 255) * (1 - amount) + (b >> 8 & 255) * amount);
      var bl = Math.round((a & 255) * (1 - amount) + (b & 255) * amount);
      return 'rgb(' + r + ',' + g + ',' + bl + ')';
    }

    function projectAll(points) {
      var out = [];
      for (var i = 0; i < points.length; i++) out.push(project(points[i], cam, view));
      return out;
    }

    function polyPath(projected) {
      ctx.beginPath();
      var started = false;
      for (var i = 0; i < projected.length; i++) {
        var p = projected[i];
        if (!p.visible) continue;
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      return started;
    }

    // The landmarks inside a plate, drawn on its top face. Their line widths
    // are plate units, so they thin out with distance like everything else.
    function drawAccents(item) {
      var accents = plateAccents(item.level);
      if (!accents.length) return;
      var scale = placementFor(item.level).scale * item.centreScale;
      accents.forEach(function (accent) {
        var spec = accent.spec;
        ctx.save();
        ctx.globalAlpha *= spec.opacity === undefined ? 0.9 : spec.opacity;
        accent.polys.forEach(function (points) {
          var projected = points.map(function (p) {
            return project(plateToWorld(item.level, p.x, p.y, item.side), cam, view);
          });
          var started = false;
          ctx.beginPath();
          projected.forEach(function (p) {
            if (!p.visible) return;
            if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
          });
          if (!started) return;
          if (spec.fill) {
            ctx.closePath();
            ctx.fillStyle = spec.fill;
            ctx.fill();
          }
          if (spec.stroke) {
            if (spec.dash) ctx.setLineDash(spec.dash.map(function (n) { return n * scale; }));
            ctx.strokeStyle = spec.stroke;
            ctx.lineWidth = Math.max(0.5, spec.width * scale);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.setLineDash([]);
          }
        });
        ctx.restore();
      });
    }

    function drawPlate(item) {
      var levelId = item.level;
      var alpha = plateAlpha(levelId);
      var thickness = slabThickness(levelId);
      var polys = item.polys;
      ctx.save();
      ctx.globalAlpha = alpha * fog(item.depth);
      for (var i = 0; i < polys.length; i++) {
        var top = polys[i];
        var bottom = top.map(function (p) { return offsetAlongNormal(levelId, p, -thickness); });
        var topProj = projectAll(top);
        var bottomProj = projectAll(bottom);

        // Side wall, as one band between the two faces.
        ctx.beginPath();
        var started = false;
        for (var a = 0; a < topProj.length; a++) {
          if (!topProj[a].visible) continue;
          if (!started) { ctx.moveTo(topProj[a].x, topProj[a].y); started = true; }
          else ctx.lineTo(topProj[a].x, topProj[a].y);
        }
        for (var b = bottomProj.length - 1; b >= 0; b--) {
          if (!bottomProj[b].visible) continue;
          if (!started) { ctx.moveTo(bottomProj[b].x, bottomProj[b].y); started = true; }
          else ctx.lineTo(bottomProj[b].x, bottomProj[b].y);
        }
        if (started) {
          ctx.closePath();
          ctx.fillStyle = '#0c2a3a';
          ctx.fill();
        }

        if (polyPath(topProj)) {
          ctx.fillStyle = levelId === state.focus ? '#2a6b85' : '#194f66';
          ctx.fill();
          ctx.lineWidth = levelId === state.focus ? 1.9 : 1.15;
          ctx.strokeStyle = levelId === state.focus ? '#a9dde6' : '#79a3b3';
          ctx.stroke();
        }
      }

      drawAccents(item);

      // Midline, on the plates that have one.
      if (!isSurfaceLevel(levelId) && placementFor(levelId).kind === 'axial') {
        var front = project(plateToWorld(levelId, 300, 392), cam, view);
        var back = project(plateToWorld(levelId, 300, 28), cam, view);
        if (front.visible && back.visible) {
          ctx.setLineDash([4, 7]);
          ctx.strokeStyle = 'rgba(160, 200, 214, 0.55)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(front.x, front.y);
          ctx.lineTo(back.x, back.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.restore();
    }

    // Plates sit close together, so a label is dropped rather than printed on
    // top of one already placed. The focused plate is placed first and so
    // always keeps its label.
    function drawPlateLabel(item, placed) {
      if (!state.labels) return;
      var level = levelById(item.level);
      var anchor = project(item.labelAt, cam, view);
      if (!anchor.visible) return;
      for (var i = 0; i < placed.length; i++) {
        if (Math.abs(placed[i].y - anchor.y) < 13 && Math.abs(placed[i].x - anchor.x) < 150) return;
      }
      placed.push({ x: anchor.x, y: anchor.y });
      ctx.save();
      ctx.globalAlpha = Math.max(0.35, plateAlpha(item.level)) * fog(item.depth);
      ctx.font = '700 11px Arial, Helvetica, sans-serif';
      ctx.fillStyle = item.level === state.focus ? '#eaf5f8' : '#9ec0ce';
      ctx.textAlign = 'left';
      ctx.fillText(item.level.toUpperCase() + '  ' + levelShortName(level), anchor.x + 8, anchor.y + 4);
      ctx.restore();
    }

    function drawTract(item) {
      ctx.save();
      ctx.globalAlpha = item.alpha * fog(item.depth);
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(item.a.x, item.a.y);
      ctx.lineTo(item.b.x, item.b.y);
      ctx.stroke();
      ctx.restore();
    }

    function drawDecussation(item) {
      ctx.save();
      ctx.globalAlpha = 0.9 * fog(item.depth);
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(item.a.x, item.a.y);
      ctx.lineTo(item.b.x, item.b.y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (state.labels) {
        ctx.font = '600 10.5px Arial, Helvetica, sans-serif';
        ctx.fillStyle = '#f0d2a4';
        ctx.textAlign = 'center';
        ctx.fillText('decussation', (item.a.x + item.b.x) / 2, (item.a.y + item.b.y) / 2 - 8);
      }
      ctx.restore();
    }

    // A marker keeps the 2D map's radius of 13 plate units, scaled by the
    // plate's own scale and by perspective, then lifted a little so the
    // numbers stay readable at the default distance.
    function markerRadius(item) {
      var radius = Math.max(3.4, Math.min(26, 13 * item.plateScale * item.scale * 1.55));
      return item.minor ? Math.max(2.6, radius * 0.44) : radius;
    }

    function drawMarker(item) {
      var radius = markerRadius(item);
      ctx.save();
      ctx.globalAlpha = item.alpha * fog(item.depth);

      if (item.inTerritory) {
        ctx.beginPath();
        ctx.arc(item.x, item.y, radius + 8, 0, Math.PI * 2);
        ctx.strokeStyle = '#d88c50';
        ctx.lineWidth = 1.8;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (item.isSelected || item.isHover) {
        ctx.beginPath();
        ctx.arc(item.x, item.y, radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = item.isSelected ? '#ffffff' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(item.x, item.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = item.inLesion ? '#ed7972' : mix(item.color, '#0a2d40', Math.min(0.45, (item.depth / (cam.distance * 3))));
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = item.inLesion ? '#fff' : '#092a3b';
      ctx.stroke();

      if (radius >= 7) {
        ctx.fillStyle = '#112f40';
        ctx.font = '700 ' + Math.round(radius * 1.05) + 'px Arial, Helvetica, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(item.number), item.x, item.y + 0.5);
      }
      ctx.restore();
    }

    function drawGizmo() {
      var size = 44;
      var ox = view.width - size - 18;
      var oy = view.height - size - 18;
      var axes = [
        { v: { x: 260, y: 0, z: 0 }, label: 'L', color: '#8fd3d2' },
        { v: { x: 0, y: 260, z: 0 }, label: 'A', color: '#e6b06a' },
        { v: { x: 0, y: 0, z: 260 }, label: 'S', color: '#b9a6ec' },
      ];
      ctx.save();
      ctx.translate(ox, oy);
      ctx.globalAlpha = 0.9;
      ctx.font = '700 10px Arial, Helvetica, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      axes.forEach(function (axis) {
        var v = toView(
          { x: axis.v.x + cam.target.x, y: axis.v.y + cam.target.y, z: axis.v.z + cam.target.z },
          cam
        );
        var sx = (v.x / 260) * size * 0.72;
        var sy = -(v.z / 260) * size * 0.72;
        ctx.strokeStyle = axis.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.fillStyle = axis.color;
        ctx.fillText(axis.label, sx * 1.22, sy * 1.22);
      });
      ctx.restore();
    }

    // ------------------------------------------------------------- compose

    function draw() {
      if (!view.width) resize();
      ctx.clearRect(0, 0, view.width, view.height);
      var items = [];
      markers = [];
      var levels = visibleLevels();

      levels.forEach(function (levelId) {
        var kind = placementFor(levelId).kind;
        var sides = kind === 'sagittal' ? [state.side === 'right' ? 'right' : 'left'] : ['left'];
        sides.forEach(function (side) {
          if (!shouldDrawSide(levelId, side)) return;
          var polys = platePolysWorld(levelId, side);
          if (!polys.length) return;
          var centre = { x: 0, y: 0, z: 0 };
          var count = 0;
          polys.forEach(function (poly) {
            poly.forEach(function (p) { centre.x += p.x; centre.y += p.y; centre.z += p.z; count++; });
          });
          centre.x /= count; centre.y /= count; centre.z /= count;
          var proj = project(centre, cam, view);
          items.push({
            type: 'plate',
            level: levelId,
            side: side,
            polys: polys,
            depth: proj.depth,
            centreScale: proj.scale,
            labelAt: labelAnchor(levelId, polys),
          });
        });
      });

      // Courses through the plates, and the named decussations.
      tractRegions().forEach(function (region) {
        var color = systemColor(region.system);
        var course = courseLevels(region, function (id) {
          return levels.indexOf(id) !== -1 && !isSurfaceLevel(id);
        });
        if (course.length < 2) return;
        var isFocusTract = region.id === state.selected || state.lesion.indexOf(region.id) !== -1;
        ['left', 'right'].forEach(function (side) {
          if (state.side !== 'bilateral' && side !== state.side && !isFocusTract) return;
          var points = smoothPath(course.map(function (step) {
            return markerToWorld(step.level, step.loc, side);
          }), 10);
          for (var i = 0; i < points.length - 1; i++) {
            var a = project(points[i], cam, view);
            var b = project(points[i + 1], cam, view);
            if (!a.visible || !b.visible) continue;
            items.push({
              type: 'tract',
              depth: (a.depth + b.depth) / 2,
              a: a,
              b: b,
              color: color,
              width: isFocusTract ? 4.2 : 2.4,
              alpha: isFocusTract ? 0.95 : (state.side === 'bilateral' || side === state.side ? 0.5 : 0.25),
            });
          }
        });

        var crossing = decussationFor(region.id);
        if (crossing && levels.indexOf(crossing.level) !== -1) {
          var loc = region.locations.find(function (l) { return l.level === crossing.level; });
          if (loc) {
            var left = project(markerToWorld(crossing.level, loc, 'left'), cam, view);
            var right = project(markerToWorld(crossing.level, loc, 'right'), cam, view);
            if (left.visible && right.visible) {
              items.push({
                type: 'decussation',
                depth: (left.depth + right.depth) / 2,
                a: left,
                b: right,
                color: color,
              });
            }
          }
        }
      });

      // Markers. Fifteen plates of numbered markers at once is unreadable, so
      // by default only the plate being studied is numbered; structures that
      // are selected, lesioned or part of a vascular example keep their
      // markers everywhere, which is what makes a course legible.
      levels.forEach(function (levelId) {
        var list = regionsAt(levelId);
        list.forEach(function (region, index) {
          var loc = region.locations.find(function (l) { return l.level === levelId; });
          if (!loc) return;
          var pinned = region.id === state.selected
            || state.lesion.indexOf(region.id) !== -1
            || state.territory.indexOf(region.id) !== -1;
          // Off-plate markers stay as small unnumbered dots: the plates keep
          // their structures, and a click still opens any of them.
          var minor = state.markerScope === 'focus' && levelId !== state.focus && !pinned;
          ['left', 'right'].forEach(function (side) {
            if (isSurfaceLevel(levelId) && !shouldDrawSide(levelId, side)) return;
            if (isSurfaceLevel(levelId) && side === 'right' && state.side !== 'right') return;
            var proj = project(markerToWorld(levelId, loc, side), cam, view);
            if (!proj.visible) return;
            var item = {
              type: 'marker',
              depth: proj.depth,
              x: proj.x,
              y: proj.y,
              scale: proj.scale,
              number: index + 1,
              region: region,
              level: levelId,
              side: side,
              plateScale: placementFor(levelId).scale,
              minor: minor,
              color: systemColor(region.system),
              alpha: markerAlpha(side) * plateAlpha(levelId) * (minor ? 0.62 : 1),
              inLesion: state.lesion.indexOf(region.id) !== -1 && (state.side === 'bilateral' || side === state.side),
              inTerritory: state.territory.indexOf(region.id) !== -1 && (state.side === 'bilateral' || side === state.side),
              isSelected: state.selected === region.id && levelId === state.focus && (state.side === 'bilateral' || side === state.side),
              isHover: hover && hover.region.id === region.id && hover.level === levelId && hover.side === side,
            };
            items.push(item);
            markers.push(item);
          });
        });
      });

      items.sort(function (a, b) { return b.depth - a.depth; });
      items.forEach(function (item) {
        if (item.type === 'plate') drawPlate(item);
        else if (item.type === 'tract') drawTract(item);
        else if (item.type === 'decussation') drawDecussation(item);
        else if (item.type === 'marker') drawMarker(item);
      });
      var plates = items.filter(function (item) { return item.type === 'plate'; });
      var placedLabels = [];
      plates
        .slice()
        .sort(function (a, b) { return (b.level === state.focus) - (a.level === state.focus); })
        .forEach(function (item) { drawPlateLabel(item, placedLabels); });
      drawGizmo();
    }

    function frame() {
      if (!running) return;
      if (state.spin && !reduceMotion.matches) {
        cam.yaw += 0.0035;
        needsDraw = true;
      }
      if (needsDraw) {
        needsDraw = false;
        draw();
      }
      window.requestAnimationFrame(frame);
    }

    // --------------------------------------------------------- interaction

    function hitTest(px, py) {
      var best = null;
      var bestDistance = Infinity;
      for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        if (m.alpha < 0.3) continue;
        var radius = Math.max(9, markerRadius(m) + 3);
        var dx = m.x - px;
        var dy = m.y - py;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= radius && distance < bestDistance) {
          bestDistance = distance;
          best = m;
        }
      }
      return best;
    }

    function showTip(marker) {
      if (!marker) {
        tip.classList.remove('on');
        return;
      }
      var level = levelById(marker.level);
      var loc = marker.region.locations.find(function (l) { return l.level === marker.level; });
      clear(tip);
      tip.appendChild(el('b', { text: marker.number + '. ' + marker.region.name }));
      tip.appendChild(el('span', {
        text: marker.side + ' · ' + level.id.toUpperCase() + ' ' + levelShortName(level) + (loc ? ' — ' + loc.position : ''),
      }));
      tip.style.left = marker.x + 'px';
      tip.style.top = marker.y + 'px';
      tip.classList.add('on');
    }

    var pointers = new Map();
    var dragging = false;
    var moved = 0;
    var last = null;
    var pinchStart = null;

    canvas.addEventListener('pointerdown', function (event) {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });
      if (pointers.size === 1) {
        dragging = true;
        moved = 0;
        last = { x: event.offsetX, y: event.offsetY };
      } else if (pointers.size === 2) {
        var values = Array.from(pointers.values());
        pinchStart = {
          distance: Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y),
          zoom: view.zoom,
        };
      }
    });

    canvas.addEventListener('pointermove', function (event) {
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });

      if (pointers.size === 2 && pinchStart) {
        var values = Array.from(pointers.values());
        var distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
        view.zoom = Math.max(0.35, Math.min(4, pinchStart.zoom * (distance / pinchStart.distance)));
        needsDraw = true;
        return;
      }

      if (dragging && last) {
        var dx = event.offsetX - last.x;
        var dy = event.offsetY - last.y;
        moved += Math.abs(dx) + Math.abs(dy);
        if (event.shiftKey) {
          view.panX += dx;
          view.panY += dy;
        } else {
          cam.yaw += dx * 0.008;
          cam.pitch = clampPitch(cam.pitch + dy * 0.006);
        }
        last = { x: event.offsetX, y: event.offsetY };
        needsDraw = true;
        return;
      }

      var marker = hitTest(event.offsetX, event.offsetY);
      if ((marker && (!hover || hover !== marker)) || (!marker && hover)) {
        hover = marker;
        canvas.classList.toggle('nvx3d-over-marker', !!marker);
        showTip(marker);
        needsDraw = true;
      } else if (marker) {
        showTip(marker);
      }
    });

    function endPointer(event) {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size === 0) {
        if (dragging && moved < 5) {
          var marker = hitTest(event.offsetX, event.offsetY);
          if (marker && opts.onPick) opts.onPick(marker, event);
        }
        dragging = false;
        last = null;
      }
    }

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', function () {
      if (hover) {
        hover = null;
        canvas.classList.remove('nvx3d-over-marker');
        showTip(null);
        needsDraw = true;
      }
    });

    canvas.addEventListener('wheel', function (event) {
      event.preventDefault();
      view.zoom = Math.max(0.35, Math.min(4, view.zoom * (event.deltaY > 0 ? 0.92 : 1.08)));
      needsDraw = true;
    }, { passive: false });

    canvas.addEventListener('keydown', function (event) {
      var step = event.shiftKey ? 0.22 : 0.09;
      if (event.key === 'ArrowLeft') cam.yaw -= step;
      else if (event.key === 'ArrowRight') cam.yaw += step;
      else if (event.key === 'ArrowUp') cam.pitch = clampPitch(cam.pitch + step);
      else if (event.key === 'ArrowDown') cam.pitch = clampPitch(cam.pitch - step);
      else if (event.key === '+' || event.key === '=') view.zoom = Math.min(4, view.zoom * 1.12);
      else if (event.key === '-') view.zoom = Math.max(0.35, view.zoom * 0.89);
      else if (event.key.toLowerCase() === 'r') api.resetView();
      else return;
      event.preventDefault();
      needsDraw = true;
    });

    var observer = null;
    if (window.ResizeObserver) {
      observer = new window.ResizeObserver(function () { resize(); });
      observer.observe(wrap);
    } else {
      window.addEventListener('resize', resize);
    }

    var api = {
      canvas: canvas,
      tip: tip,
      state: state,
      camera: cam,
      setState: function (patch) {
        Object.keys(patch).forEach(function (key) { state[key] = patch[key]; });
        needsDraw = true;
      },
      // Moves in on the plate being studied, keeping its neighbours in frame.
      centreOnFocus: function () {
        var placement = placementFor(state.focus);
        cam.target = placement.kind === 'axial'
          ? { x: 0, y: 0, z: placement.at }
          : plateToWorld(state.focus, 300, 210, state.side === 'right' ? 'right' : 'left');
        cam.distance = 1750;
        needsDraw = true;
      },
      // Frames the whole column, cortex included.
      fitAll: function () {
        cam.target = { x: 0, y: 0, z: 690 };
        cam.distance = 3300;
        view.zoom = 1;
        view.panX = 0;
        view.panY = 0;
        needsDraw = true;
      },
      setViewpoint: function (name) {
        var point = VIEWPOINTS[name] || VIEWPOINTS.oblique;
        cam.yaw = point.yaw;
        cam.pitch = point.pitch;
        needsDraw = true;
      },
      resetView: function () {
        api.setViewpoint('oblique');
        api.fitAll();
      },
      zoomBy: function (factor) {
        view.zoom = Math.max(0.35, Math.min(4, view.zoom * factor));
        needsDraw = true;
      },
      redraw: function () { needsDraw = true; },
      destroy: function () {
        running = false;
        if (observer) observer.disconnect();
        else window.removeEventListener('resize', resize);
      },
    };

    resize();
    window.requestAnimationFrame(frame);
    return api;
  }

  // ----------------------------------------------------------- text panels

  function sourceLinks(refs) {
    var links = atlas.sourcesFor(refs);
    return el('div', { class: 'source-links' }, links.map(function (source) {
      return el('a', { href: source.url, target: '_blank', rel: 'noreferrer', text: source.title + ' ↗' });
    }));
  }

  function fact(name, children) {
    return el('div', { class: 'fact' }, [el('h3', { text: name })].concat(children));
  }

  // --------------------------------------------------------- the full view

  function mountFullView(host) {
    var state = {
      focus: 'm3',
      side: 'left',
      dominance: 'left',
      selected: '',
      lesion: [],
      territory: '',
      mode: 'stack',
      tracts: 'selected',
      labels: true,
      spin: false,
      markerScope: 'focus',
      groups: { brainstem: true, forebrain: true, cortex: true, cerebellum: true },
    };

    // Opening the 3D view on whatever the lesion explorer was showing keeps
    // the two views talking about the same thing.
    var bridged = readExplorerState();
    if (bridged) {
      state.focus = bridged.level || state.focus;
      state.side = bridged.side || state.side;
      state.dominance = bridged.dominance || state.dominance;
      state.selected = bridged.selected || '';
      state.lesion = bridged.lesion || [];
    }
    if (!state.selected) state.selected = (regionsAt(state.focus)[0] || {}).id || '';

    var renderer = null;
    var root = el('div', { class: 'explorer nvx3d' });
    host.appendChild(root);

    // The canvas and its overlay controls are built once and moved into each
    // re-render, so the WebGL-free scene, the camera and the resize observer
    // all survive a panel rebuild.
    var stageWrap = el('div', { class: 'nvx3d-canvas-wrap', style: 'height:min(64vh,620px)' });
    var spinButton = null;

    function territoryRegions() {
      var territory = atlas.data.territories.find(function (t) { return t.id === state.territory; });
      return territory ? territory.regions : [];
    }

    function pushToRenderer() {
      if (!renderer) return;
      renderer.setState({
        focus: state.focus,
        side: state.side,
        mode: state.mode,
        tracts: state.tracts,
        labels: state.labels,
        selected: state.selected,
        lesion: state.lesion,
        territory: territoryRegions(),
        spin: state.spin,
        markerScope: state.markerScope,
        groups: state.groups,
      });
    }

    function selectLevel(levelId, keepLesion) {
      state.focus = levelId;
      if (!keepLesion) {
        state.lesion = [];
        state.territory = '';
      }
      var first = regionsAt(levelId)[0];
      if (!regionsAt(levelId).some(function (r) { return r.id === state.selected; })) {
        state.selected = first ? first.id : '';
      }
      render();
      if (renderer) renderer.centreOnFocus();
    }

    function toggleLesion(regionId) {
      var index = state.lesion.indexOf(regionId);
      if (index === -1) state.lesion = state.lesion.concat([regionId]);
      else state.lesion = state.lesion.filter(function (id) { return id !== regionId; });
      state.territory = '';
      render();
    }

    function loadTerritory(id) {
      var territory = atlas.data.territories.find(function (t) { return t.id === id; });
      if (!territory) {
        state.territory = '';
        state.lesion = [];
        render();
        return;
      }
      state.territory = id;
      state.focus = territory.level;
      state.lesion = territory.regions.slice();
      state.selected = territory.regions[0];
      if (territory.bilateral) state.side = 'bilateral';
      render();
      if (renderer) renderer.centreOnFocus();
    }

    // ------------------------------------------------------------ sidebar

    function buildSidebar() {
      var aside = el('aside', { class: 'level-sidebar' }, [
        el('p', { class: 'eyebrow', text: '15 PLATES IN SPACE' }),
      ]);
      atlas.groups.forEach(function (group) {
        var section = el('section', {}, [el('h2', { text: group })]);
        atlas.data.levels.filter(function (level) { return level.group === group; }).forEach(function (level) {
          section.appendChild(el('button', {
            class: level.id === state.focus ? 'current-level' : '',
            'aria-current': level.id === state.focus ? 'true' : null,
            onclick: function () { selectLevel(level.id); },
          }, [el('span', { text: level.id.toUpperCase() }), levelShortName(level)]));
        });
        aside.appendChild(section);
      });

      var toggles = el('section', {}, [el('h2', { text: 'Show in the model' })]);
      var groupBox = el('div', { class: 'nvx3d-group-toggles' });
      [
        ['brainstem', 'Brainstem plates'],
        ['forebrain', 'Thalamus & capsule'],
        ['cortex', 'Cortical surfaces'],
        ['cerebellum', 'Cerebellum'],
      ].forEach(function (pair) {
        var input = el('input', {
          type: 'checkbox',
          checked: state.groups[pair[0]] ? true : null,
          onchange: function (event) {
            state.groups[pair[0]] = event.target.checked;
            pushToRenderer();
          },
        });
        groupBox.appendChild(el('label', {}, [input, pair[1]]));
      });
      toggles.appendChild(groupBox);
      aside.appendChild(toggles);
      return aside;
    }

    // -------------------------------------------------------------- stage

    function buildStage() {
      var panel = el('section', { class: 'map-panel nvx3d-stage' });
      panel.appendChild(el('div', { class: 'map-caption' }, [
        el('span', { text: 'NEURAXIS MODEL · 15 PLATES' }),
        el('span', { text: atlas.cap(state.side) + ' selected' }),
      ]));

      panel.appendChild(stageWrap);

      panel.appendChild(el('div', { class: 'nvx3d-toggles' }, [
        el('label', {}, [
          el('input', {
            type: 'checkbox',
            checked: state.mode === 'focus' ? true : null,
            onchange: function (event) {
              state.mode = event.target.checked ? 'focus' : 'stack';
              pushToRenderer();
              renderer.centreOnFocus();
            },
          }),
          'Isolate this region of the neuraxis',
        ]),
        el('label', {}, [
          el('input', {
            type: 'checkbox',
            checked: state.markerScope === 'all' ? true : null,
            onchange: function (event) {
              state.markerScope = event.target.checked ? 'all' : 'focus';
              pushToRenderer();
            },
          }),
          'Number every plate',
        ]),
        el('label', {}, [
          el('input', {
            type: 'checkbox',
            checked: state.labels ? true : null,
            onchange: function (event) { state.labels = event.target.checked; pushToRenderer(); },
          }),
          'Plate labels',
        ]),
        el('label', {}, [
          'Courses',
          el('select', {
            'aria-label': 'Show structure courses',
            onchange: function (event) { state.tracts = event.target.value; pushToRenderer(); },
          }, [
            el('option', { value: 'selected', text: 'Selected & lesioned', selected: state.tracts === 'selected' ? true : null }),
            el('option', { value: 'all', text: 'All multi-level structures', selected: state.tracts === 'all' ? true : null }),
            el('option', { value: 'off', text: 'Off', selected: state.tracts === 'off' ? true : null }),
          ]),
        ]),
      ]));

      panel.appendChild(el('div', { class: 'map-key' }, [
        el('span', {}, [el('i', { style: 'background:#ed7972' }), 'Lesioned structure']),
        el('span', {}, [el('i', { class: 'ring' }), 'Vascular example']),
        el('span', { class: 'nvx3d-hint', text: 'Drag to rotate · wheel or pinch to zoom · shift-drag to pan · click a marker' }),
      ]));

      panel.appendChild(el('p', {
        text: 'Plates are placed along the neuraxis in rostrocaudal order, each in the plane its 2D map represents: transverse sections stacked by level, cortical surfaces as sagittal projections, the cerebellum as a dorsal projection behind the brainstem.',
      }));
      panel.appendChild(el('p', {
        text: 'This is a schematic montage. Relative plate sizes, spacing and marker positions are teaching approximations, not MRI coordinates or infarct volumes.',
      }));

      var legend = el('div', { class: 'nvx3d-legend' });
      Object.keys(atlas.colors).forEach(function (system) {
        legend.appendChild(el('span', {}, [el('i', { style: 'background:' + atlas.colors[system] }), system]));
      });
      panel.appendChild(legend);
      return panel;
    }

    // Overlay controls: built once, they live inside the persistent stage.
    function buildStageOverlay() {
      var views = el('div', { class: 'nvx3d-views' });
      [
        ['oblique', 'Oblique'],
        ['anterior', 'Anterior'],
        ['posterior', 'Posterior'],
        ['left', 'Left'],
        ['superior', 'Superior'],
      ].forEach(function (pair) {
        views.appendChild(el('button', {
          type: 'button',
          text: pair[1],
          onclick: function () { renderer.setViewpoint(pair[0]); },
        }));
      });
      spinButton = el('button', {
        type: 'button',
        text: 'Spin',
        class: state.spin ? 'on' : '',
        onclick: function () {
          state.spin = !state.spin;
          spinButton.className = state.spin ? 'on' : '';
          pushToRenderer();
        },
      });
      views.appendChild(spinButton);
      views.appendChild(el('button', {
        type: 'button',
        text: 'Reset',
        onclick: function () { renderer.resetView(); renderer.centreOnFocus(); },
      }));

      stageWrap.appendChild(views);
      stageWrap.appendChild(el('div', { class: 'nvx3d-zoom' }, [
        el('button', { type: 'button', text: '+', 'aria-label': 'Zoom in', onclick: function () { renderer.zoomBy(1.15); } }),
        el('button', { type: 'button', text: '−', 'aria-label': 'Zoom out', onclick: function () { renderer.zoomBy(0.87); } }),
      ]));
    }

    // ---------------------------------------------------- structure panel

    function buildStructurePanel() {
      var region = regionById(state.selected) || regionsAt(state.focus)[0];
      var panel = el('section', { class: 'structure-panel', 'aria-label': 'Selected structure' });
      if (!region) return panel;
      var loc = region.locations.find(function (l) { return l.level === state.focus; });
      var inLesion = state.lesion.indexOf(region.id) !== -1;

      panel.appendChild(el('div', { class: 'structure-header' }, [
        el('span', { class: 'system-tag', style: 'border-color:' + systemColor(region.system), text: region.system }),
        el('span', { class: 'muted', text: region.short }),
      ]));
      panel.appendChild(el('h2', { text: region.name }));
      if (loc) panel.appendChild(el('p', { class: 'location', text: loc.position }));

      panel.appendChild(el('button', {
        class: inLesion ? 'primary removed' : 'primary',
        onclick: function () { toggleLesion(region.id); },
        text: (inLesion ? 'Remove from lesion' : 'Add to lesion simulation') + ' ' + (inLesion ? '−' : '+'),
      }));

      var course = courseLevels(region);
      if (course.length > 1) {
        panel.appendChild(fact('Course through the model', [
          el('p', { text: course.map(function (step) { return step.level.toUpperCase(); }).join(' → ') }),
          el('p', {
            class: 'small',
            text: 'Shown as a line through the plates this structure is marked on. Between plates the line is interpolated, not measured.',
          }),
        ]));
      }

      panel.appendChild(fact('What this structure does', [el('p', { text: region.function })]));
      panel.appendChild(fact('If injured', sidesFor(state.side).map(function (side) {
        return el('p', {}, [
          el('strong', { text: atlas.cap(side) + ' lesion: ' }),
          atlas.deficit(region, state.focus, side, state.dominance),
        ]);
      })));
      panel.appendChild(fact('Crossing rule', [el('p', { text: region.crossing })]));

      var details = el('details', {}, [el('summary', { text: 'Course, blood supply & pitfalls' })]);
      details.appendChild(fact('Course', [el('p', { text: region.course })]));
      details.appendChild(fact('Supply associated with this level', [
        el('ul', {}, atlas.supply(region, state.focus).map(function (entry) { return el('li', { text: entry }); })),
        el('p', { class: 'small', text: 'Branch contributions overlap. This list identifies plausible supply, not a proven occlusion.' }),
      ]));
      details.appendChild(fact('Localization pitfall', [el('p', { text: region.pitfall })]));
      details.appendChild(sourceLinks(region.refs));
      panel.appendChild(details);
      return panel;
    }

    // -------------------------------------------------------- lesion panel

    function buildLesionPanel() {
      var list = regionsAt(state.focus);
      var lesioned = list.filter(function (region) { return state.lesion.indexOf(region.id) !== -1; });
      var territory = atlas.data.territories.find(function (t) { return t.id === state.territory; });
      var panel = el('section', { class: 'lesion-panel' });

      panel.appendChild(el('div', { class: 'section-heading' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow', text: 'STRUCTURE → FUNCTION LOST' }),
          el('h2', {}, ['Lesion simulation ', el('span', { class: 'count', text: String(lesioned.length) })]),
        ]),
        el('button', {
          class: 'secondary',
          disabled: state.lesion.length ? null : true,
          text: 'Clear lesion',
          onclick: function () { state.lesion = []; state.territory = ''; render(); },
        }),
      ]));
      panel.appendChild(el('p', {
        class: 'muted',
        text: 'Click a marker in the model, or a structure below, then add it to the lesion. The model draws lesioned structures in red and follows their course through the plates.',
      }));

      if (territory) {
        panel.appendChild(el('div', { class: 'territory-summary' }, [
          el('h3', { text: territory.name }),
          el('p', {}, [el('strong', { text: 'Supply: ' }), territory.origin]),
          el('p', { text: territory.pattern }),
          el('p', { class: 'small', text: territory.caveat }),
          sourceLinks(territory.refs),
        ]));
      }

      var grid = el('div', { class: 'selection-grid' });
      list.forEach(function (region, index) {
        var inLesion = state.lesion.indexOf(region.id) !== -1;
        grid.appendChild(el('div', { class: inLesion ? 'selection-item damaged' : 'selection-item' }, [
          el('input', {
            type: 'checkbox',
            'aria-label': 'Include ' + region.name + ' in lesion',
            checked: inLesion ? true : null,
            onchange: function () { toggleLesion(region.id); },
          }),
          el('button', {
            onclick: function () { state.selected = region.id; render(); },
          }, [el('span', { class: 'number', text: String(index + 1) }), region.name]),
        ]));
      });
      panel.appendChild(grid);

      var results = el('div', { class: 'deficit-results', 'aria-live': 'polite' });
      if (lesioned.length) {
        lesioned.forEach(function (region) {
          var article = el('article', {}, [el('h3', { text: region.name })]);
          sidesFor(state.side).forEach(function (side) {
            article.appendChild(el('p', {}, [
              el('span', { class: 'side-chip', text: atlas.cap(side) }),
              atlas.deficit(region, state.focus, side, state.dominance),
            ]));
          });
          results.appendChild(article);
        });
        if (state.side === 'bilateral') {
          results.appendChild(el('p', {
            class: 'callout',
            text: 'Bilateral effects can be more than the sum of two unilateral lesions—for example, impaired arousal, severe memory disturbance or loss of bilateral motor output.',
          }));
        }
      } else {
        results.appendChild(el('p', {
          class: 'empty-note',
          text: 'No structures selected. Pick a marker in the model, or load a vascular example above.',
        }));
      }
      panel.appendChild(results);
      return panel;
    }

    // ------------------------------------------------------------- render

    function render() {
      var level = levelById(state.focus);
      clear(root);
      root.appendChild(buildSidebar());

      var content = el('div', { class: 'explorer-content' });
      content.appendChild(el('div', { class: 'page-heading' }, [
        el('div', {}, [
          el('p', { class: 'eyebrow', text: '3D NEURAXIS / ' + level.id.toUpperCase() }),
          el('h1', { text: levelShortName(level) }),
          el('p', { text: level.landmark }),
        ]),
        el('span', { class: 'tag', text: 'Schematic montage' }),
      ]));

      var controls = el('div', { class: 'controls' }, [
        el('label', {}, ['Lesion side', el('select', {
          'aria-label': 'Lesion side',
          onchange: function (event) { state.side = event.target.value; render(); },
        }, [
          el('option', { value: 'left', text: 'Left', selected: state.side === 'left' ? true : null }),
          el('option', { value: 'right', text: 'Right', selected: state.side === 'right' ? true : null }),
          el('option', { value: 'bilateral', text: 'Bilateral', selected: state.side === 'bilateral' ? true : null }),
        ])]),
        el('label', {}, ['Language dominance', el('select', {
          'aria-label': 'Language dominance',
          onchange: function (event) { state.dominance = event.target.value; render(); },
        }, [
          el('option', { value: 'left', text: 'Left hemisphere', selected: state.dominance === 'left' ? true : null }),
          el('option', { value: 'right', text: 'Right hemisphere', selected: state.dominance === 'right' ? true : null }),
          el('option', { value: 'unknown', text: 'Unknown', selected: state.dominance === 'unknown' ? true : null }),
        ])]),
        el('label', { class: 'preset-label' }, ['Vascular / syndrome example', el('select', {
          'aria-label': 'Load vascular example',
          onchange: function (event) { loadTerritory(event.target.value); },
        }, [el('option', { value: '', text: 'Choose an example…' })].concat(
          atlas.data.territories.filter(function (t) { return t.level === state.focus; }).map(function (t) {
            return el('option', { value: t.id, text: t.name, selected: state.territory === t.id ? true : null });
          })
        ))]),
      ]);
      content.appendChild(controls);

      var grid = el('div', { class: 'anatomy-grid' });
      grid.appendChild(buildStage());
      grid.appendChild(buildStructurePanel());
      grid.appendChild(el('section', { class: 'level-note' }, [
        el('h2', { text: 'Read this level' }),
        el('p', { text: level.notes }),
        el('p', { class: 'small', text: atlas.orientation(level) }),
        sourceLinks(level.refs),
      ]));
      grid.appendChild(buildLesionPanel());
      content.appendChild(grid);
      root.appendChild(content);

      // The renderer survives re-renders: only its host moves.
      if (!renderer) {
        renderer = createRenderer(stageWrap, {
          onPick: function (marker, event) {
            if (event && (event.metaKey || event.ctrlKey)) {
              toggleLesion(marker.region.id);
              return;
            }
            state.selected = marker.region.id;
            if (state.side !== 'bilateral' && !isSurfaceLevel(marker.level)) state.side = marker.side;
            if (marker.level !== state.focus) {
              selectLevel(marker.level, true);
              return;
            }
            render();
          },
        });
        buildStageOverlay();
        renderer.fitAll();
      }
      pushToRenderer();
    }

    render();
    return {
      destroy: function () { if (renderer) renderer.destroy(); },
    };
  }

  // ------------------------------------------------- lesion explorer bridge
  //
  // The explorer is React-rendered, so the 3D panel talks to it the way a
  // person would: it reads the rendered controls and clicks them. That keeps
  // one source of truth for side, lesion and selection instead of a second
  // copy of the app's state.

  // Switching to the 3D view unmounts the explorer, so its state is snapshotted
  // while it is on screen and read back when the 3D view opens.
  var lastExplorerState = null;

  function explorerRoot() {
    return document.querySelector('.explorer:not(.nvx3d)');
  }

  function readExplorerState() {
    try {
      var root = explorerRoot();
      if (!root) return lastExplorerState;
      var current = root.querySelector('.level-sidebar button.current-level span');
      var sideSelect = root.querySelector('select[aria-label="Lesion side"]');
      var dominance = root.querySelector('select[aria-label="Language dominance"]');
      var selectedMarker = root.querySelector('.section-map g[aria-pressed="true"]');
      var selectedName = null;
      if (selectedMarker) {
        var label = selectedMarker.getAttribute('aria-label') || '';
        selectedName = label.replace(/^\d+\.\s*(left|right)\s*/, '');
      } else {
        var heading = root.querySelector('.structure-panel h2');
        if (heading) selectedName = heading.textContent;
      }
      var byName = {};
      atlas.data.regions.forEach(function (region) { byName[region.name] = region.id; });
      var lesion = Array.prototype.slice
        .call(root.querySelectorAll('.selection-grid input[type="checkbox"]'))
        .filter(function (input) { return input.checked; })
        .map(function (input) {
          var label = (input.getAttribute('aria-label') || '').replace(/^Include\s+/, '').replace(/\s+in lesion$/, '');
          return byName[label];
        })
        .filter(Boolean);
      lastExplorerState = {
        level: current ? current.textContent.toLowerCase() : null,
        side: sideSelect ? sideSelect.value : null,
        dominance: dominance ? dominance.value : null,
        selected: selectedName ? byName[selectedName] : null,
        lesion: lesion,
      };
      return lastExplorerState;
    } catch (err) {
      return lastExplorerState;
    }
  }

  function clickExplorerMarker(regionId, levelId, side) {
    try {
      var root = explorerRoot();
      if (!root) return false;
      var region = regionById(regionId);
      if (!region) return false;
      var number = markerNumber(levelId, regionId);
      var wanted = number + '. ' + side + ' ' + region.name;
      var target = root.querySelector('.section-map g[aria-label="' + wanted.replace(/"/g, '\\"') + '"]');
      if (!target) return false;
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    } catch (err) {
      return false;
    }
  }

  // A 2D/3D switch inside the explorer's map panel: the same model, showing
  // the plate being studied in its place in the column.
  var inlineModeOn = false;

  function mountExplorerSwitch() {
    var panel = document.querySelector('.explorer:not(.nvx3d) .map-panel');
    // Both halves have to be present: React can rebuild the panel and take
    // one of them with it.
    if (!panel) return;
    if (panel.querySelector('.nvx3d-switch') && panel.querySelector('.nvx3d-inline-wrap')) return;
    var stale = panel.querySelector('.nvx3d-switch');
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
    var staleWrap = panel.querySelector('.nvx3d-inline-wrap');
    if (staleWrap && staleWrap.parentNode) staleWrap.parentNode.removeChild(staleWrap);
    var caption = panel.querySelector('.map-caption');
    var svg = panel.querySelector('.section-map');
    if (!caption || !svg) return;

    var wrap = el('div', { class: 'nvx3d-canvas-wrap nvx3d-inline-wrap', style: 'display:none' });
    svg.parentNode.insertBefore(wrap, svg.nextSibling);

    var renderer = null;
    var on = false;

    function sync() {
      var read = readExplorerState();
      if (!renderer || !read) return;
      var focus = read.level || 'm3';
      // The inline panel is a locator, not the whole tour: it shows the plate
      // being studied among its own neighbours.
      var groups = { brainstem: false, forebrain: false, cortex: false, cerebellum: false };
      groups[groupKey(focus)] = true;
      renderer.setState({
        focus: focus,
        side: read.side || 'left',
        selected: read.selected || '',
        lesion: read.lesion || [],
        mode: 'stack',
        groups: groups,
      });
      renderer.centreOnFocus();
    }

    var buttons = el('div', { class: 'nvx3d-switch' });
    var twoD = el('button', { type: 'button', text: '2D', class: 'on' });
    var threeD = el('button', { type: 'button', text: '3D' });

    function setMode(next) {
      on = next;
      inlineModeOn = next;
      twoD.className = on ? '' : 'on';
      threeD.className = on ? 'on' : '';
      svg.style.display = on ? 'none' : '';
      wrap.style.display = on ? '' : 'none';
      if (on && !renderer) {
        renderer = createRenderer(wrap, {
          onPick: function (marker) {
            clickExplorerMarker(marker.region.id, marker.level, marker.side);
          },
        });
        renderer.setViewpoint('plate');
      }
      if (on) {
        renderer.redraw();
        sync();
      }
    }

    twoD.addEventListener('click', function () { setMode(false); });
    threeD.addEventListener('click', function () { setMode(true); });
    buttons.appendChild(twoD);
    buttons.appendChild(threeD);
    caption.appendChild(buttons);
    if (inlineModeOn) setMode(true);

    // React re-renders the panel on every state change; re-read afterwards.
    var observer = new MutationObserver(function () {
      if (!document.body.contains(wrap)) {
        observer.disconnect();
        if (renderer) renderer.destroy();
        return;
      }
      if (on) sync();
    });
    observer.observe(panel, { childList: true, subtree: true, attributes: true });
  }

  // ------------------------------------------------------------------ boot

  function boot() {
    atlas = window.__ATLAS__;
    if (!atlas) return;

    var mounted = null;
    var host = null;

    function tick() {
      var next = document.getElementById(HOST_ID);
      if (next !== host) {
        if (mounted) {
          mounted.destroy();
          mounted = null;
        }
        host = next;
        if (host && !host.childNodes.length) mounted = mountFullView(host);
      }
      if (document.querySelector('.explorer:not(.nvx3d) .map-panel')) {
        mountExplorerSwitch();
        readExplorerState();
      }
    }

    var observer = new MutationObserver(tick);
    observer.observe(document.body, { childList: true, subtree: true });
    tick();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
