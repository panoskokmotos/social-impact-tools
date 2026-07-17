# Curated "Do this now" actions — reference list

**Status: approved and implemented.** The live data is `compass/data-actions.js` (rendered in the app and all static pages, named in the FAQ, allowed in the AI prompts). This file remains as the rationale record: why each organization was chosen, and which categories were deliberately left empty. If you edit the list, edit `data-actions.js` and regenerate the pages (`python3 compass/build-pages.py && python3 compass/build-el.py`).

## What this is

For each of the 25 problems, one or two real organizations, each backing an intervention the page already rates. Chosen for evidence and transparency (GiveWell and ACE recommendations where they exist, otherwise the strongest available operator). The app would present them under the Act section as:

> **🎯 Do this now** · Examples chosen for evidence and transparency. Not the only good options, and we have no affiliation, no payment, no affiliate links.

## What changes on approval (I implement all of it)

A `donow` field per problem in `data.js` (`{org, url, what, evidence}`), rendered at the top of the Act section in the app and on all 50 static pages, with an `outbound_donow_click` funnel event. The FAQ answer "Impact Compass doesn't name individual charities" gets rewritten to the criteria-based-examples framing, in both languages. The AI prompts drop the "never name charities" rule and instead allow exactly the curated examples. Greek pages get translated descriptions, and wherever you have a matching Givelink listing, the Greek page points there first (only you can map those).

## Decisions I need from you

1. Approve the naming stance and the disclaimer wording above, or edit it.
2. Approve or swap organizations below. The two flagged weak categories especially.
3. Tell me which problems have a matching Givelink listing for the Greek edition.

---

## The list

### 🌍 Extreme Poverty
1. **GiveDirectly** · givedirectly.org · backs: direct cash transfers. The most-studied cash-transfer NGO, long-running RCTs, radically transparent. Confidence: strong.
2. **BRAC** · brac.net · backs: graduation programs. Built the model, replicated in RCTs across multiple countries. Confidence: strong.

### 🦟 Malaria
1. **Against Malaria Foundation** · againstmalaria.com · backs: insecticide-treated nets. Long-time GiveWell top charity, publishes distribution-level data. Confidence: strong.
2. **Malaria Consortium** · malariaconsortium.org · backs: seasonal malaria chemoprevention. Its SMC program is a GiveWell top charity. Confidence: strong.

### 👶 Child Mortality
1. **New Incentives** · newincentives.org · backs: childhood vaccination. GiveWell top charity, cash incentives that raise vaccination uptake. Confidence: strong.
2. **Helen Keller Intl** · helenkellerintl.org · backs: vitamin A supplementation. GiveWell top charity for its vitamin A program. Confidence: strong.

### 🍽️ Hunger & Malnutrition
1. **Action Against Hunger** · actionagainsthunger.org · backs: therapeutic feeding (RUTF). Major operator of community-based acute-malnutrition treatment. Confidence: strong.
2. **GAIN** · gainhealth.org · backs: food fortification. The dedicated global fortification alliance. Confidence: strong.

### 💧 Unsafe Water & Sanitation
1. **Evidence Action** · evidenceaction.org · backs: water chlorination. Dispensers for Safe Water and in-line chlorination, heavily GiveWell-funded. Confidence: strong.

### 📚 Education Gaps
1. **Pratham** · pratham.org · backs: teaching at the right level. Co-developed the approach with J-PAL, among the strongest RCT records in education. Confidence: strong.

### 🫂 Loneliness & Mental Health
1. **StrongMinds** · strongminds.org · backs: lay-counselor talk therapy. Group interpersonal therapy for depression at low cost per person treated. Confidence: strong.
2. **Friendship Bench** · friendshipbenchzimbabwe.org · backs: lay-counselor talk therapy. Grandmother-delivered therapy, RCT-validated, now spreading internationally. Confidence: strong.

### 🏠 Homelessness
1. **Community Solutions** · community.solutions · backs: Housing First. Built for Zero has driven measurable reductions across US communities. Confidence: strong, but US-centric, flag for Greek audience (Givelink mapping matters most here).

### 🧳 Refugees & Displacement
1. **International Rescue Committee** · rescue.org · backs: cash assistance. Large-scale cash programming with a serious internal evidence unit. Confidence: strong.
2. **UNHCR** · unhcr.org · backs: resettlement and protection. The mandated global agency. Confidence: strong.

### 🌡️ Climate Change
1. **Clean Air Task Force** · catf.us · backs: clean energy deployment and policy. Repeatedly top-recommended by Founders Pledge for cost-effective climate advocacy. Confidence: strong.

### 🏭 Air Pollution
1. **Clean Air Fund** · cleanairfund.org · backs: emission standards and monitoring. The dedicated philanthropic fund for clean-air policy and open data. Confidence: promising.

### ⚖️ Gender Inequality
1. **Educate Girls** · educategirls.ngo · backs: keeping girls in school. Village-level enrollment work in India, validated through a development impact bond. Confidence: strong.
2. **Girls Not Brides** · girlsnotbrides.org · backs: programs against child marriage. The global partnership on child marriage. Confidence: promising.

### 🐄 Factory Farming
1. **The Humane League** · thehumaneleague.org · backs: corporate welfare campaigns. ACE top charity, cage-free commitments with follow-through tracking. Confidence: strong.
2. **Good Food Institute** · gfi.org · backs: alternative proteins. ACE-recommended, the field's main science and policy hub. Confidence: promising.

### 👁️ Preventable Blindness
1. **Fred Hollows Foundation** · hollows.org · backs: cataract surgery programs. High-volume, low-cost sight restoration. Confidence: strong.
2. **Sightsavers** · sightsavers.org · backs: trachoma elimination (SAFE). Major operator across trachoma and vision programs. Confidence: strong.

### 🦠 Pandemic Preparedness
1. **CEPI** · cepi.net · backs: vaccine platform readiness. The coalition behind the 100-days vaccine mission. Confidence: promising. Note: funded mainly by governments and foundations, individual giving is possible but this one is as much an advocacy target as a donation target.

### 🫁 Tuberculosis
1. **TB Alliance** · tballiance.org · backs: new drug-resistant TB regimens. Developed the BPaL regimen that transformed MDR-TB treatment. Confidence: strong.
2. **Partners In Health** · pih.org · backs: case finding and treatment support. Decades of MDR-TB care delivery in the hardest settings. Confidence: strong.

### 🎨 Lead Poisoning
1. **LEEP (Lead Exposure Elimination Project)** · leadelimination.org · backs: lead paint regulation. Startlingly cost-effective advocacy, backed by GiveWell-adjacent funders. Confidence: strong.
2. **Pure Earth** · pureearth.org · backs: source remediation. The main operator on contaminated sites, spices, and cookware. Confidence: promising.

### 🤰 Maternal Mortality
1. **Partners In Health** · pih.org · backs: skilled birth attendance and emergency obstetric care. Builds and staffs the referral systems that stop hemorrhage deaths. Confidence: strong.
2. **Fistula Foundation** · fistulafoundation.org · backs: the surgical end of maternal injury. Focused, transparent, high volume. Confidence: strong.

### 🚗 Road Traffic Deaths
1. **Amend** · amend.org · backs: safe road design. School-area infrastructure in African cities, unusually measurable for the sector. Confidence: promising.

### 🚬 Tobacco
1. **Campaign for Tobacco-Free Kids** · tobaccofreekids.org · backs: taxation and smoke-free policy. The leading global advocacy operation behind tobacco tax wins. Confidence: strong.

### 🎗️ HIV / AIDS
1. **Médecins Sans Frontières** · msf.org · backs: antiretroviral therapy at scale. Delivers ART where systems are weakest. Confidence: strong.
2. **Elizabeth Glaser Pediatric AIDS Foundation** · pedaids.org · backs: preventing mother-to-child transmission. The dedicated PMTCT operator. Confidence: strong.

### 🪱 Neglected Tropical Diseases
1. **END Fund** · end.org · backs: mass drug administration. The pooled fund for NTD treatment at scale. Confidence: strong.
2. **Unlimit Health** · unlimithealth.org · backs: elimination campaigns. Formerly SCI Foundation, a past GiveWell top charity for schistosomiasis. Confidence: strong.

### 📶 Digital Exclusion — ⚠️ weak category, review closely
1. **Giga (UNICEF/ITU)** · giga.global · backs: connecting schools. Real and measurable, but individual donations route through UNICEF generally. Confidence: promising.
2. **APC** · apc.org · backs: community networks. The established network for community connectivity, donation pathway is thin. Confidence: promising.
Honest note: this category has no GiveWell-grade option. Consider showing only the "voice/skills" actions here, or drop the donow block for this problem.

### 🏛️ Corruption
1. **Transparency International** · transparency.org · backs: transparency and registries. The reference global anti-corruption network. Confidence: strong.
2. **OCCRP** · occrp.org · backs: investigative journalism. The cross-border investigative network behind major exposés. Confidence: strong.

### 🌊 Ocean Health — ⚠️ mixed category, review closely
1. **Oceana** · oceana.org · backs: fisheries management reform. Policy-focused, counts wins in rebuilt fisheries. Confidence: promising.
Honest note: plastic-cleanup organizations are popular but debated on cost-effectiveness (the page itself rates "stopping plastic at the source" as the evidence-backed path). I recommend one org here, not two, and honest framing.

---

## Sanity checks before shipping (on your approval)

I verify every URL resolves, re-run the page generators, confirm the disclaimer renders on app and static pages in both languages, and confirm the new `outbound_donow_click` event fires. Anything you strike from the list simply doesn't ship for that problem, the block hides when `donow` is empty.
