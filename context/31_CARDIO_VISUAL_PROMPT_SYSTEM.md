# Cardiology visual prompt system v1

This is the visual-generation contract for editorial cardiology cards. It adapts the supplied specialty prompt family to cardiology and removes the burgundy / stock-healthcare look.

## Style lock

Use the attached reference images as STYLE REFERENCE ONLY.

Preserve one visual family across the whole cardiology series:

- premium scientific editorial illustration
- extremely thin anatomical contour drawing
- elegant topographic / flow-field lines
- warm off-white / very light ivory background
- high negative space
- one dominant medically recognizable structure
- one article-specific relationship expressed through the contour / flow behavior
- restrained Yandex Med lavender / blue-violet signal
- no glossy 3D
- no stock-photo healthcare look
- no photorealistic doctor / patient
- no cartoon style
- no generic medical icons
- no infographic labels
- no text, numbers, legend or watermark
- no decorative DNA, AI nodes or random medical symbols

Target: **medical atlas precision × contemporary scientific editorial design × Yandex Med restraint**.

### Format

- 2:1 landscape for editorial cards
- all medically meaningful information inside the central 60–70% crop-safe zone
- 65–85% quiet negative space
- one semantic anchor should occupy roughly 20–35% of the image
- controlled variation between adjacent cards: macro close-up / medium sectional view / system overview / isolated semantic object
- do not reuse the same centered heart composition
- do not default to left-to-right flow unless the clinical relationship requires it

### Palette

- background: #FFFFFF / #F2F2F2 / warm ivory
- primary: #898BFF / #7275FF / #5759EF
- secondary lavender: #DABDFF / #AFA2FF
- restrained cool blue may be used for imaging / vascular contrast
- pink or dusty rose only when medically meaningful and never as the dominant cardiology signal
- 80–90% neutral field; 10–20% brand signal maximum

## Content passport

Before rendering, derive and state:

1. `ARTICLE TITLE`
2. `CONTENT TYPE`
3. `CLINICAL SUBJECT`
4. `CLINICAL JOB`
5. `ARTICLE-SPECIFIC RELATIONSHIP`
6. `WHAT A PHYSICIAN SHOULD READ IN 500 MS`
7. `SHOT MODE`
8. `PRIMARY SEMANTIC ANCHOR`
9. `DO NOT USE`

Formula:

**ONE recognizable medical anchor + ONE medically true relationship + large negative space.**

Reject the result if removing the headline makes the medical subject impossible to infer, if the picture could fit 20 unrelated articles, or if style carries more information than the clinical meaning.

## Cardiology scenario library

### 1. Arterial hypertension

- CLINICAL SUBJECT: sustained arterial pressure load
- CLINICAL JOB: assess / monitor / control risk
- PRIMARY SEMANTIC ANCHOR: anatomically reduced muscular artery in cross-section
- ARTICLE-SPECIFIC RELATIONSHIP: the pressure / contour field becomes denser against the vessel wall, communicating chronic load without a literal gauge
- 500 MS READ: the article is about elevated arterial pressure and its vascular burden
- DO NOT USE: blood-pressure cuff, red warning sign, ECG icon, full human silhouette

### 2. Ischemic heart disease

- CLINICAL SUBJECT: coronary atherosclerotic narrowing
- CLINICAL JOB: recognize / stratify / choose next step
- PRIMARY SEMANTIC ANCHOR: one coronary artery segment with a focal plaque-induced lumen narrowing
- ARTICLE-SPECIFIC RELATIONSHIP: smooth proximal flow compresses through the narrowed segment and becomes reduced / disturbed downstream
- 500 MS READ: coronary blood flow is limited by a focal lesion
- DO NOT USE: generic chest pain pose, heart-with-lightning icon, ambulance imagery

### 3. Heart failure

- CLINICAL SUBJECT: impaired ventricular pump function
- CLINICAL JOB: assess / stabilize / monitor
- PRIMARY SEMANTIC ANCHOR: left ventricle in simplified longitudinal section
- ARTICLE-SPECIFIC RELATIONSHIP: incoming and outgoing flow remains anatomically coherent but the field shows reduced forward organization and increased residual volume
- 500 MS READ: ventricular pumping is less effective
- DO NOT USE: droplet icon, swollen legs, dramatic blue person silhouette

### 4. Atrial fibrillation

- CLINICAL SUBJECT: disorganized atrial activation
- CLINICAL JOB: diagnose / control rhythm or rate / prevent complications
- PRIMARY SEMANTIC ANCHOR: left atrium with pulmonary-vein ostia
- ARTICLE-SPECIFIC RELATIONSHIP: several irregular activation wavefronts circulate and collide across the atrial field instead of one ordered propagation front
- 500 MS READ: atrial electrical activation is irregular and disorganized
- DO NOT USE: generic ECG strip as the hero, lightning bolts, random network nodes

### 5. Arrhythmia / conduction

- CLINICAL SUBJECT: abnormal impulse propagation
- CLINICAL JOB: localize / classify / choose management
- PRIMARY SEMANTIC ANCHOR: reduced cardiac conduction pathway or myocardial tissue strip
- ARTICLE-SPECIFIC RELATIONSHIP: one wavefront follows an abnormal focal or re-entry path while the rest of the field remains quiet
- 500 MS READ: the problem is impulse propagation, not anatomy alone
- DO NOT USE: generic waveform icon, pacemaker stock image unless the article is specifically about pacing

### 6. Valvular heart disease

- CLINICAL SUBJECT: valvular obstruction or regurgitation
- CLINICAL JOB: assess severity / image / plan intervention
- PRIMARY SEMANTIC ANCHOR: anatomically credible aortic or mitral valve in sectional view, selected from the article subject
- ARTICLE-SPECIFIC RELATIONSHIP: show one true flow consequence — narrowed jet for stenosis or backward flow for regurgitation
- 500 MS READ: valve mechanics are changing intracardiac flow
- DO NOT USE: generic heart icon, arbitrary arrows, four valves at once

### 7. Cardiomyopathy

- CLINICAL SUBJECT: myocardial structural remodeling
- CLINICAL JOB: characterize phenotype / assess risk
- PRIMARY SEMANTIC ANCHOR: left-ventricular myocardial wall and cavity in section
- ARTICLE-SPECIFIC RELATIONSHIP: wall thickness, chamber geometry or fiber field changes according to the specific phenotype named in the article
- 500 MS READ: myocardial structure is the clinical subject
- DO NOT USE: one generic enlarged heart for every cardiomyopathy

### 8. Dyslipidemia and prevention

- CLINICAL SUBJECT: lipid-driven atherosclerotic risk
- CLINICAL JOB: assess / prevent / monitor
- PRIMARY SEMANTIC ANCHOR: arterial intima with a reduced plaque / lipid pool in macro cross-section
- ARTICLE-SPECIFIC RELATIONSHIP: particles / contour density accumulate at the vessel wall while the lumen remains the dominant anatomical reference
- 500 MS READ: lipid burden relates to atherosclerotic plaque formation
- DO NOT USE: cholesterol text, food imagery, pill bottle, blood-test tube unless the article requires laboratory testing

### 9. Cardiovascular imaging

- CLINICAL SUBJECT: multimodal cardiac imaging
- CLINICAL JOB: compare / interpret modality role / navigate anatomy
- PRIMARY SEMANTIC ANCHOR: one cardiac structure represented through two or three modality-specific sectional treatments
- ARTICLE-SPECIFIC RELATIONSHIP: the same anatomy is revealed differently by echo, MRI or CT without becoming a collage
- 500 MS READ: the article is about how imaging modalities describe the same cardiac structure
- DO NOT USE: generic monitor, radiologist silhouette, fake diagnostic labels

### 10. Interventional cardiology

- CLINICAL SUBJECT: catheter-based coronary intervention
- CLINICAL JOB: treat lesion / restore lumen / understand procedure
- PRIMARY SEMANTIC ANCHOR: one stenotic coronary segment with a stent or balloon only when the article is intervention-specific
- ARTICLE-SPECIFIC RELATIONSHIP: the lumen transitions from constrained to mechanically supported with restored flow continuity
- 500 MS READ: a focal coronary lesion is being treated from inside the vessel
- DO NOT USE: operating room stock scene, surgeon hands, generic catheter without anatomical context

## Rendering rule for article-specific variants

The scenario library is not the final prompt. For each ContentObject, derive the exact semantic anchor from:

`topic × clinical job × article-specific relationship`.

Then vary viewpoint and crop scale so adjacent cards do not repeat. If the article is about a drug, device, procedure or diagnostic sign, that exact object may replace the scenario anchor only when it is supported by the article brief.
