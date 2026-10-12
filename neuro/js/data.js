/* ================================================
   NEURO MULTIVERSE — data.js
   The content: one "universe" per area of neurology, each with its
   high-yield notes and its practice questions. Nothing else lives here,
   so neuro/selftest.mjs can load this file on its own and check it.

   Question ids are what progress is stored against, so once a question
   has shipped its id never changes. Reword the question freely; give it
   a new id only if it now asks something else.
   ================================================ */
(function (root) {
  "use strict";
  const NM = (root.NM = root.NM || {});

  NM.data = [
    {
      id: "localization",
      name: "Localization",
      glyph: "◎",
      tagline: "Where is the lesion?",
      notes: [
        { title: "Upper vs lower motor neuron", body: "UMN: spasticity, hyperreflexia, extensor plantars, pyramidal-pattern weakness. LMN: wasting, fasciculations, hypotonia, reduced or absent reflexes." },
        { title: "Brown-Séquard (hemicord)", body: "Below the lesion: ipsilateral weakness and loss of vibration and proprioception (dorsal columns); contralateral loss of pain and temperature (spinothalamic tract, which crosses within a segment or two)." },
        { title: "Lateral medullary (Wallenberg)", body: "Vertebral or PICA territory. Ipsilateral facial pain/temperature loss, Horner syndrome, ataxia, and dysphagia/hoarseness (nucleus ambiguus); contralateral loss of pain/temperature in the body. Limb strength is spared." },
        { title: "Third nerve palsy", body: "Eye 'down and out' with ptosis. A dilated pupil points to compression (posterior communicating artery aneurysm) and needs urgent vascular imaging; a pupil-sparing palsy is more often microvascular." },
        { title: "Aphasias", body: "Broca (dominant inferior frontal gyrus): non-fluent, comprehension relatively spared. Wernicke (dominant posterior superior temporal gyrus): fluent but empty, poor comprehension. Conduction: repetition is disproportionately impaired." },
        { title: "Gerstmann syndrome", body: "Dominant angular gyrus (parietal): agraphia, acalculia, finger agnosia and left–right confusion." }
      ],
      questions: [
        { id: "loc-1", q: "A 58-year-old has sudden severe headache, ptosis and a dilated, unreactive left pupil with the eye turned down and out. What must be excluded first?", options: ["Posterior communicating artery aneurysm", "Diabetic microvascular third nerve palsy", "Myasthenia gravis", "Horner syndrome"], answer: 0, why: "A painful, pupil-involving third nerve palsy is compressive until proven otherwise; the classic culprit is a PCom aneurysm. Image the vessels urgently." },
        { id: "loc-2", q: "Below a spinal cord lesion there is right-sided weakness and loss of vibration sense, with loss of pain and temperature on the left. What is the lesion?", options: ["Right hemisection of the cord", "Left hemisection of the cord", "Anterior spinal artery infarct", "Central cord syndrome"], answer: 0, why: "Brown-Séquard: motor and dorsal column loss on the side of the lesion, spinothalamic loss on the opposite side." },
        { id: "loc-3", q: "Vertigo, hoarseness, a left Horner syndrome, left facial numbness and right-sided body pain/temperature loss. Which artery is most likely occluded?", options: ["Left vertebral artery or PICA", "Left anterior inferior cerebellar artery", "Basilar artery tip", "Left anterior cerebral artery"], answer: 0, why: "This is the lateral medullary (Wallenberg) syndrome, from vertebral artery or PICA occlusion." },
        { id: "loc-4", q: "Fluent speech with paraphasias and poor comprehension localises to which area?", options: ["Dominant posterior superior temporal gyrus", "Dominant inferior frontal gyrus", "Non-dominant parietal lobe", "Arcuate fasciculus alone"], answer: 0, why: "Wernicke's area is in the posterior superior temporal gyrus of the dominant hemisphere." },
        { id: "loc-5", q: "Which of these is a lower motor neuron sign?", options: ["Fasciculations", "Clonus", "Extensor plantar response", "Spastic catch"], answer: 0, why: "Fasciculations come from denervated motor units. The other three are upper motor neuron signs." }
      ]
    },
    {
      id: "stroke",
      name: "Stroke",
      glyph: "⚡",
      tagline: "Time is brain",
      notes: [
        { title: "Image first", body: "Non-contrast CT head first, to exclude haemorrhage before any thrombolysis. CT angiography looks for a large vessel occlusion that could be retrieved." },
        { title: "Thrombolysis", body: "IV alteplase or tenecteplase for eligible patients within 4.5 hours of when they were last known well." },
        { title: "Thrombectomy", body: "For anterior circulation large vessel occlusion: standard within 6 hours, and up to 24 hours in patients selected by perfusion or clinical–imaging mismatch (DAWN, DEFUSE 3)." },
        { title: "Lacunar syndromes", body: "Pure motor (posterior limb of internal capsule), pure sensory (thalamus), ataxic hemiparesis, dysarthria–clumsy hand. No cortical signs: no aphasia, neglect or field defect." },
        { title: "Secondary prevention", body: "Anticoagulate for atrial fibrillation. Carotid endarterectomy for symptomatic stenosis of 70–99% (and selected 50–69%), ideally within two weeks of the event. Antiplatelet, statin and blood pressure control for most." }
      ],
      questions: [
        { id: "str-1", q: "A patient arrives 90 minutes after sudden right-sided weakness. What is the first investigation?", options: ["Non-contrast CT head", "MRI with diffusion-weighted imaging", "Carotid Doppler", "Lumbar puncture"], answer: 0, why: "Non-contrast CT is fast and excludes haemorrhage, which is what decides whether thrombolysis is possible." },
        { id: "str-2", q: "What is the usual time window for IV thrombolysis in acute ischaemic stroke?", options: ["Within 4.5 hours of last known well", "Within 1 hour", "Within 12 hours", "Within 24 hours"], answer: 0, why: "Thrombolysis is given within 4.5 hours of when the patient was last known to be well." },
        { id: "str-3", q: "A pure sensory stroke affecting the face, arm and leg on one side most likely involves the:", options: ["Thalamus", "Posterior limb of the internal capsule", "Cerebellum", "Occipital cortex"], answer: 0, why: "Pure sensory lacunes are thalamic (ventral posterior nuclei)." },
        { id: "str-4", q: "Non-fluent aphasia with right face and arm weakness, leg relatively spared. Which territory?", options: ["Left MCA, superior division", "Left ACA", "Right MCA", "Left PCA"], answer: 0, why: "The superior division of the left MCA supplies Broca's area and the face/arm motor cortex; the leg area is ACA territory." },
        { id: "str-5", q: "Up to how long after onset can selected patients with an anterior circulation large vessel occlusion still benefit from thrombectomy?", options: ["24 hours", "4.5 hours", "6 hours, with no exceptions", "72 hours"], answer: 0, why: "DAWN and DEFUSE 3 extended the window to 24 hours for patients selected by imaging." }
      ]
    },
    {
      id: "epilepsy",
      name: "Epilepsy",
      glyph: "∿",
      tagline: "Storms in the cortex",
      notes: [
        { title: "Status epilepticus", body: "A seizure lasting 5 minutes or more, or repeated seizures without recovery in between. First line: a benzodiazepine (IV lorazepam, or IM/buccal midazolam). Second line: levetiracetam, fosphenytoin or valproate, which worked about equally well in the ESETT trial." },
        { title: "Childhood absence epilepsy", body: "Brief staring spells, often many a day, which hyperventilation can provoke. EEG: 3 Hz generalised spike-and-wave. Ethosuximide is first line." },
        { title: "Juvenile myoclonic epilepsy", body: "Myoclonic jerks in the morning, generalised tonic-clonic seizures, sometimes absences. Valproate works well but is avoided in women who could become pregnant; levetiracetam or lamotrigine instead. Carbamazepine and phenytoin can make it worse." },
        { title: "Valproate", body: "Highly teratogenic: neural tube defects and neurodevelopmental harm. Avoid in women of childbearing potential unless nothing else works and a pregnancy prevention programme is in place." },
        { title: "Carbamazepine", body: "Enzyme inducer, causes hyponatraemia. HLA-B*15:02 (common in people of Southeast Asian ancestry) predicts Stevens-Johnson syndrome / TEN; test before starting it." }
      ],
      questions: [
        { id: "epi-1", q: "First-line treatment for childhood absence epilepsy?", options: ["Ethosuximide", "Carbamazepine", "Phenytoin", "Gabapentin"], answer: 0, why: "Ethosuximide is first line. Carbamazepine and phenytoin can make absences worse." },
        { id: "epi-2", q: "A generalised convulsion has gone on for 5 minutes. The first drug to give is:", options: ["A benzodiazepine", "Levetiracetam", "Phenobarbital", "Propofol"], answer: 0, why: "Benzodiazepines are first line; levetiracetam, fosphenytoin or valproate come second." },
        { id: "epi-3", q: "Which drug can make juvenile myoclonic epilepsy worse?", options: ["Carbamazepine", "Levetiracetam", "Valproate", "Lamotrigine"], answer: 0, why: "Sodium channel blockers such as carbamazepine and phenytoin can worsen myoclonus and absences." },
        { id: "epi-4", q: "Before starting carbamazepine in a patient of Han Chinese ancestry, which test reduces the risk of SJS/TEN?", options: ["HLA-B*15:02", "HLA-B*27", "HLA-B*57:01", "TPMT activity"], answer: 0, why: "HLA-B*15:02 is strongly associated with carbamazepine-induced SJS/TEN. HLA-B*57:01 goes with abacavir." },
        { id: "epi-5", q: "What does the EEG classically show in childhood absence epilepsy?", options: ["3 Hz generalised spike-and-wave", "Hypsarrhythmia", "Periodic sharp wave complexes", "Centrotemporal spikes"], answer: 0, why: "3 Hz spike-and-wave is the classic pattern. Hypsarrhythmia is infantile spasms; centrotemporal spikes are self-limited epilepsy with centrotemporal spikes." }
      ]
    },
    {
      id: "movement",
      name: "Movement",
      glyph: "≋",
      tagline: "Too little, too much",
      notes: [
        { title: "Parkinson's disease", body: "Bradykinesia plus rest tremor and/or rigidity, starting on one side. Postural instability comes later. Levodopa is the most effective treatment; motor fluctuations and dyskinesia appear with time." },
        { title: "Red flags for atypical parkinsonism", body: "Early falls and vertical (especially downward) gaze palsy: PSP. Early autonomic failure and cerebellar signs: MSA. Apraxia, alien limb, cortical sensory loss: corticobasal syndrome. Poor response to levodopa in any of them." },
        { title: "Essential tremor", body: "Bilateral postural and action tremor, often runs in families, often eases with alcohol. Propranolol or primidone." },
        { title: "Drug-induced parkinsonism", body: "Dopamine blockers: antipsychotics, metoclopramide, prochlorperazine. Usually symmetrical. Stop the drug." },
        { title: "Huntington's disease", body: "Autosomal dominant CAG repeat expansion in HTT on chromosome 4. Chorea, psychiatric change and dementia. Anticipation, most marked when inherited from the father." },
        { title: "Wilson's disease", body: "ATP7B mutation, so copper builds up. Tremor, dystonia, psychiatric change, liver disease, Kayser-Fleischer rings. Low ceruloplasmin, high urinary copper." }
      ],
      questions: [
        { id: "mov-1", q: "Parkinsonism with early falls and a vertical gaze palsy, worst looking down, suggests:", options: ["Progressive supranuclear palsy", "Multiple system atrophy", "Idiopathic Parkinson's disease", "Essential tremor"], answer: 0, why: "Early falls and a vertical supranuclear gaze palsy are the hallmarks of PSP." },
        { id: "mov-2", q: "A bilateral action tremor that improves with a glass of wine is most likely:", options: ["Essential tremor", "Parkinson's disease", "Cerebellar tremor", "Wilson's disease"], answer: 0, why: "Essential tremor is postural/action, bilateral, and often eases with alcohol." },
        { id: "mov-3", q: "The genetic defect in Huntington's disease is:", options: ["CAG repeat expansion in HTT, chromosome 4", "CTG repeat expansion in DMPK", "GAA repeat expansion in frataxin", "ATP7B mutation"], answer: 0, why: "HTT CAG expansion on chromosome 4. DMPK is myotonic dystrophy type 1; frataxin is Friedreich's ataxia." },
        { id: "mov-4", q: "A young adult with tremor, a personality change and abnormal liver tests. Which blood result supports the likely diagnosis?", options: ["Low ceruloplasmin", "High ferritin", "Low vitamin B12", "High creatine kinase"], answer: 0, why: "Wilson's disease: low ceruloplasmin, high urinary copper, Kayser-Fleischer rings." },
        { id: "mov-5", q: "Which drug is most likely to cause parkinsonism?", options: ["Metoclopramide", "Ondansetron", "Domperidone", "Omeprazole"], answer: 0, why: "Metoclopramide blocks central D2 receptors. Domperidone hardly crosses the blood–brain barrier." }
      ]
    },
    {
      id: "neuromuscular",
      name: "Neuromuscular",
      glyph: "⟟",
      tagline: "Nerve, junction, muscle",
      notes: [
        { title: "Myasthenia gravis", body: "Fatigable ptosis, diplopia, bulbar and proximal weakness. Anti-AChR antibodies in most generalised cases; anti-MuSK in some of the rest. Check for thymoma. Pyridostigmine for symptoms; immunosuppression and thymectomy as indicated." },
        { title: "Drugs that worsen myasthenia", body: "Aminoglycosides, fluoroquinolones, macrolides, IV magnesium, beta-blockers, and others. Check before prescribing." },
        { title: "Guillain-Barré syndrome", body: "Weakness that ascends over days with areflexia, often after Campylobacter or another infection. CSF: high protein with a normal cell count. IVIG or plasma exchange. Watch the vital capacity; a falling FVC (below about 20 mL/kg) means ventilatory support." },
        { title: "Miller Fisher syndrome", body: "Ophthalmoplegia, ataxia and areflexia. Anti-GQ1b antibodies." },
        { title: "Lambert-Eaton syndrome", body: "Antibodies to P/Q-type voltage-gated calcium channels; often paraneoplastic (small cell lung cancer). Proximal weakness that improves briefly with effort, reduced reflexes, autonomic symptoms." },
        { title: "Motor neuron disease (ALS)", body: "Upper and lower motor neuron signs together, with sensation spared. Riluzole modestly prolongs survival. Plan early for nutrition and breathing." }
      ],
      questions: [
        { id: "nmj-1", q: "The typical CSF finding in Guillain-Barré syndrome is:", options: ["High protein with a normal cell count", "High white cells with low glucose", "Oligoclonal bands with normal protein", "Xanthochromia"], answer: 0, why: "Albuminocytological dissociation: protein up, cells normal." },
        { id: "nmj-2", q: "Lambert-Eaton syndrome is caused by antibodies against:", options: ["P/Q-type voltage-gated calcium channels", "Acetylcholine receptors", "Muscle-specific kinase", "Aquaporin-4"], answer: 0, why: "LEMS antibodies target presynaptic P/Q-type VGCCs, so less acetylcholine is released." },
        { id: "nmj-3", q: "Ophthalmoplegia, ataxia and areflexia after a diarrhoeal illness. Which antibody fits?", options: ["Anti-GQ1b", "Anti-AChR", "Anti-NMDA receptor", "Anti-Hu"], answer: 0, why: "Miller Fisher syndrome, a GBS variant, is associated with anti-GQ1b." },
        { id: "nmj-4", q: "In a patient with myasthenia gravis, which antibiotic is best avoided?", options: ["Gentamicin", "Amoxicillin", "Doxycycline", "Nitrofurantoin"], answer: 0, why: "Aminoglycosides impair neuromuscular transmission and can precipitate a myasthenic crisis." },
        { id: "nmj-5", q: "Wasting and fasciculations in the hands, brisk reflexes and extensor plantars, normal sensation. Most likely:", options: ["Motor neuron disease (ALS)", "Cervical radiculopathy", "Peripheral neuropathy", "Myasthenia gravis"], answer: 0, why: "Upper and lower motor neuron signs together with normal sensation is the pattern of ALS." }
      ]
    },
    {
      id: "demyelination",
      name: "Demyelination",
      glyph: "⌬",
      tagline: "MS and its mimics",
      notes: [
        { title: "Diagnosing MS (McDonald 2017)", body: "Lesions disseminated in space and in time. CSF-specific oligoclonal bands can stand in for dissemination in time." },
        { title: "Optic neuritis", body: "Pain on eye movement, reduced acuity, colour desaturation (especially red), relative afferent pupillary defect. Most recover over weeks." },
        { title: "Treating relapses", body: "High-dose methylprednisolone speeds recovery from a relapse but does not change long-term disability. Disease-modifying therapy is what reduces relapses." },
        { title: "Internuclear ophthalmoplegia", body: "Lesion of the medial longitudinal fasciculus. The eye on the side of the lesion fails to adduct; the other eye has nystagmus when it abducts. Bilateral INO in a young adult suggests MS." },
        { title: "NMOSD", body: "Anti-aquaporin-4 antibodies. Severe optic neuritis, longitudinally extensive transverse myelitis (3 or more vertebral segments), area postrema syndrome (intractable hiccups or vomiting). Some MS drugs make it worse, so tell them apart." },
        { title: "Uhthoff's phenomenon", body: "Symptoms worsen temporarily with heat (a hot bath, exercise, fever) because conduction in demyelinated axons fails." }
      ],
      questions: [
        { id: "dem-1", q: "Anti-aquaporin-4 antibodies are characteristic of:", options: ["Neuromyelitis optica spectrum disorder", "Multiple sclerosis", "MOG antibody disease", "Acute disseminated encephalomyelitis"], answer: 0, why: "AQP4-IgG defines most cases of NMOSD." },
        { id: "dem-2", q: "Transverse myelitis is called 'longitudinally extensive' when it spans at least:", options: ["3 vertebral segments", "1 vertebral segment", "6 vertebral segments", "The whole cord"], answer: 0, why: "Three or more contiguous segments is the definition, and it points towards NMOSD rather than MS." },
        { id: "dem-3", q: "A patient with MS finds their leg weakness worse after a hot shower. This is:", options: ["Uhthoff's phenomenon", "Lhermitte's sign", "A new relapse", "Pseudobulbar affect"], answer: 0, why: "Uhthoff's phenomenon is a temporary worsening with heat. Lhermitte's is an electric sensation on bending the neck." },
        { id: "dem-4", q: "Failure of adduction of the right eye with nystagmus in the left eye on looking left. Where is the lesion?", options: ["Right medial longitudinal fasciculus", "Left medial longitudinal fasciculus", "Right abducens nucleus", "Left oculomotor nerve"], answer: 0, why: "In INO the eye that fails to adduct is on the side of the MLF lesion." },
        { id: "dem-5", q: "Under McDonald 2017, what can substitute for dissemination in time?", options: ["CSF-specific oligoclonal bands", "A raised CSF white cell count", "Visual evoked potentials", "A positive AQP4 antibody"], answer: 0, why: "CSF-specific oligoclonal bands can stand in for dissemination in time." }
      ]
    },
    {
      id: "headache",
      name: "Headache",
      glyph: "✶",
      tagline: "Primary or sinister?",
      notes: [
        { title: "Thunderclap headache", body: "Peaks within a minute. Subarachnoid haemorrhage until proven otherwise. Non-contrast CT is most sensitive in the first 6 hours; if it is negative and the patient presents later, LP at least 12 hours after onset for xanthochromia." },
        { title: "Giant cell arteritis", body: "Over 50, new headache, jaw claudication, scalp tenderness, visual symptoms, raised ESR/CRP. Start high-dose steroids straight away to protect vision; confirm with temporal artery ultrasound or biopsy." },
        { title: "Cluster headache", body: "Severe one-sided orbital pain lasting 15–180 minutes, with tearing, a red eye, a blocked nose, and restlessness. Acute: high-flow oxygen, subcutaneous or nasal triptan. Prevention: verapamil (watch the ECG)." },
        { title: "Idiopathic intracranial hypertension", body: "Typically women of childbearing age with obesity. Headache, papilloedema, pulsatile tinnitus, raised opening pressure with normal imaging (exclude venous sinus thrombosis). Weight loss, acetazolamide; protect vision." },
        { title: "Medication-overuse headache", body: "Simple analgesics on 15 or more days a month, or triptans, opioids or combinations on 10 or more days a month, for over 3 months. Withdraw the overused drug and start prevention." }
      ],
      questions: [
        { id: "hed-1", q: "Acute treatment for a cluster headache attack:", options: ["High-flow 100% oxygen", "Oral propranolol", "Oral amitriptyline", "Codeine"], answer: 0, why: "High-flow oxygen and subcutaneous or nasal triptans are first line. Propranolol and amitriptyline are migraine prevention." },
        { id: "hed-2", q: "A 74-year-old with new headache, jaw claudication and ESR 90. What should happen first?", options: ["Start high-dose corticosteroids", "Wait for temporal artery biopsy before treating", "MRI brain", "Start a triptan"], answer: 0, why: "Treat at once to prevent permanent vision loss. Biopsy remains informative for days after steroids start." },
        { id: "hed-3", q: "First-line drug for idiopathic intracranial hypertension:", options: ["Acetazolamide", "Sumatriptan", "Amitriptyline", "Prednisolone"], answer: 0, why: "Acetazolamide lowers CSF production. Weight loss is the other mainstay." },
        { id: "hed-4", q: "In which patient are triptans contraindicated?", options: ["Someone with ischaemic heart disease", "Someone with asthma", "Someone taking paracetamol", "Someone with migraine with aura"], answer: 0, why: "Triptans constrict vessels, so they are avoided in coronary, cerebrovascular and peripheral vascular disease." },
        { id: "hed-5", q: "A 'worst ever' headache peaking within seconds, 2 hours ago. The first investigation is:", options: ["Non-contrast CT head", "Lumbar puncture straight away", "EEG", "Plain skull X-ray"], answer: 0, why: "CT first, which is most sensitive early. LP for xanthochromia only if CT is negative, at least 12 hours after onset." }
      ]
    },
    {
      id: "cognition",
      name: "Cognition",
      glyph: "◈",
      tagline: "Memory and its failures",
      notes: [
        { title: "Alzheimer's disease", body: "Early loss of episodic memory, hippocampal atrophy. Cholinesterase inhibitors (donepezil, rivastigmine, galantamine); memantine in moderate to severe disease." },
        { title: "Dementia with Lewy bodies", body: "Fluctuating cognition, well-formed visual hallucinations, REM sleep behaviour disorder, parkinsonism. Severe sensitivity to antipsychotics, so avoid them where at all possible." },
        { title: "Frontotemporal dementia", body: "Often starts before 65. Behavioural variant: disinhibition, apathy, loss of empathy, compulsions, changed eating habits. Language variants: semantic and non-fluent primary progressive aphasia." },
        { title: "Normal pressure hydrocephalus", body: "Gait disturbance (magnetic, broad-based), urinary incontinence, cognitive decline; ventricles enlarged out of proportion to atrophy. Can improve after a large-volume LP or a shunt." },
        { title: "Creutzfeldt-Jakob disease", body: "Dementia progressing over weeks to months, with myoclonus and ataxia. MRI: cortical ribboning and basal ganglia restricted diffusion. CSF RT-QuIC is highly specific; EEG may show periodic sharp wave complexes." },
        { title: "Wernicke encephalopathy", body: "Confusion, ophthalmoplegia/nystagmus, ataxia; often only part of the triad. Give IV thiamine promptly, before or with glucose, in anyone at risk." }
      ],
      questions: [
        { id: "cog-1", q: "Fluctuating cognition, visual hallucinations and mild parkinsonism. Which drug class is most dangerous here?", options: ["Antipsychotics", "Cholinesterase inhibitors", "SSRIs", "Melatonin"], answer: 0, why: "In dementia with Lewy bodies, antipsychotics can cause severe and sometimes fatal reactions." },
        { id: "cog-2", q: "The classic triad of normal pressure hydrocephalus is:", options: ["Gait disturbance, urinary incontinence, dementia", "Headache, vomiting, papilloedema", "Confusion, ophthalmoplegia, ataxia", "Myoclonus, dementia, ataxia"], answer: 0, why: "Gait, continence and cognition. Confusion, ophthalmoplegia and ataxia is Wernicke's." },
        { id: "cog-3", q: "A positive CSF RT-QuIC test supports which diagnosis?", options: ["Creutzfeldt-Jakob disease", "Alzheimer's disease", "Autoimmune encephalitis", "Multiple sclerosis"], answer: 0, why: "RT-QuIC detects misfolded prion protein and is highly specific for CJD." },
        { id: "cog-4", q: "A malnourished patient with alcohol dependence is confused and ataxic. What should be given promptly?", options: ["IV thiamine", "IV glucose on its own", "Oral folic acid on its own", "Haloperidol"], answer: 0, why: "Suspected Wernicke encephalopathy needs IV thiamine; glucose without thiamine can precipitate it or make it worse." },
        { id: "cog-5", q: "The earliest typical cognitive symptom of Alzheimer's disease is:", options: ["Impaired episodic memory", "Disinhibition", "Visual hallucinations", "Non-fluent speech"], answer: 0, why: "Trouble learning and keeping new information reflects early damage to the hippocampus and medial temporal lobe." }
      ]
    }
  ];
})(typeof window !== "undefined" ? window : globalThis);
