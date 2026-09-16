/* ================================================
   ROAMGUIDE — catalog.js
   The built-in guidebook: four cities, what's worth your time in each,
   and the practical things a guidebook opens to.

   It ships inside the app on purpose. A guide you can't read because the
   hotel wifi is down is not a guide. Nothing here fetches anything.

   Opening hours, prices and closures are what they were when this was
   written and they drift — seasons, holidays, refurbishments. Treat them
   as planning figures, not promises; every place carries a link out to
   OpenStreetMap so you can check before you walk.
   ================================================ */
(function (RG) {
  "use strict";

  /* Hours are seven strings, Sunday first. "" means closed that day. */
  const daily = (h) => [h, h, h, h, h, h, h];
  const except = (h, closedDays, alt) => {
    const week = daily(h);
    (closedDays || []).forEach((d) => { week[d] = alt || ""; });
    return week;
  };
  const ALWAYS = daily("00:00-23:59");

  const CATEGORIES = {
    sight:    { label: "Landmark",  icon: "◈" },
    museum:   { label: "Museum",    icon: "▤" },
    sacred:   { label: "Temple",    icon: "⛩" },
    food:     { label: "Food",      icon: "◍" },
    market:   { label: "Market",    icon: "▦" },
    nature:   { label: "Outdoors",  icon: "❧" },
    view:     { label: "Viewpoint", icon: "△" },
    night:    { label: "After dark",icon: "☾" },
    transit:  { label: "Getting about", icon: "⇄" },
  };

  /* The cities themselves live one to a file under js/cities/, each one
     calling register() as it loads. Eight guidebooks in a single array
     was a file nobody would want to edit; this way a city is a file you
     can read end to end, and adding one is adding a file.

     dayBudget is the rough cost of an ordinary day on the ground in the
     local currency — a couple of transit rides, lunch, a coffee, one paid
     sight — and seeds the budget when you start a trip there. */
  const cities = [];

  function register(city) {
    cities.push(city);
    return city;
  }

  // ---- lookups ----
  const cityById = (id) => cities.find((c) => c.id === id) || null;

  /* Every built-in place, each stamped with the city it belongs to so a
     search across cities can still say where a result is. */
  function allPlaces() {
    const out = [];
    cities.forEach((c) => {
      c.places.forEach((p) => out.push(Object.assign({ city: c.id, cityName: c.name }, p)));
    });
    return out;
  }

  function placeById(id) {
    return allPlaces().find((p) => p.id === id) || null;
  }

  RG.catalog = {
    CATEGORIES, cities, register, cityById, allPlaces, placeById,
    hours: { daily, except, ALWAYS },
  };
})(window.RG);
