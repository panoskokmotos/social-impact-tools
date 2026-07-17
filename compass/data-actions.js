/**
 * data-actions.js — curated "Do this now" examples per problem.
 * One or two real organizations per problem, each backing an intervention
 * the page already rates. Chosen for evidence and transparency (GiveWell
 * and ACE recommendations where they exist). Examples, not endorsements:
 * no affiliation, no payment, no affiliate links. Problems without a
 * GiveWell-grade option (digital exclusion) deliberately have no entry.
 * Loaded after data.js; keys are COMPASS_PROBLEMS ids.
 */
const COMPASS_DONOW = {
  "extreme-poverty": [
    { org: "GiveDirectly", url: "https://www.givedirectly.org", evidence: "strong",
      what: "sends cash directly to the poorest households, the most-studied way to help",
      what_el: "στέλνει μετρητά απευθείας στα φτωχότερα νοικοκυριά, ο πιο μελετημένος τρόπος βοήθειας" },
    { org: "BRAC", url: "https://www.brac.net", evidence: "strong",
      what: "runs the graduation programs that move families out of ultra-poverty",
      what_el: "υλοποιεί τα προγράμματα «αποφοίτησης» που βγάζουν οικογένειες από την ακραία φτώχεια" },
  ],
  "malaria": [
    { org: "Against Malaria Foundation", url: "https://www.againstmalaria.com", evidence: "strong",
      what: "funds long-lasting insecticide-treated nets, with distribution-level transparency",
      what_el: "χρηματοδοτεί εντομοαπωθητικές κουνουπιέρες μακράς διάρκειας, με πλήρη διαφάνεια στη διανομή" },
    { org: "Malaria Consortium", url: "https://www.malariaconsortium.org", evidence: "strong",
      what: "delivers seasonal malaria chemoprevention to children",
      what_el: "παρέχει εποχική χημειοπροφύλαξη ελονοσίας σε παιδιά" },
  ],
  "child-mortality": [
    { org: "New Incentives", url: "https://www.newincentives.org", evidence: "strong",
      what: "boosts childhood vaccination with small cash incentives",
      what_el: "αυξάνει τον παιδικό εμβολιασμό με μικρά κίνητρα μετρητών" },
    { org: "Helen Keller Intl", url: "https://helenkellerintl.org", evidence: "strong",
      what: "runs vitamin A supplementation that saves young lives",
      what_el: "υλοποιεί προγράμματα βιταμίνης Α που σώζουν παιδικές ζωές" },
  ],
  "hunger": [
    { org: "Action Against Hunger", url: "https://www.actionagainsthunger.org", evidence: "strong",
      what: "treats severe child malnutrition with therapeutic food",
      what_el: "θεραπεύει τον σοβαρό παιδικό υποσιτισμό με θεραπευτική τροφή" },
    { org: "GAIN", url: "https://www.gainhealth.org", evidence: "strong",
      what: "fortifies staple foods with the nutrients people are missing",
      what_el: "εμπλουτίζει βασικά τρόφιμα με τα θρεπτικά συστατικά που λείπουν" },
  ],
  "unsafe-water": [
    { org: "Evidence Action", url: "https://www.evidenceaction.org", evidence: "strong",
      what: "chlorinates drinking water at scale for pennies per person",
      what_el: "χλωριώνει πόσιμο νερό σε μεγάλη κλίμακα με ελάχιστο κόστος ανά άτομο" },
  ],
  "education": [
    { org: "Pratham", url: "https://www.pratham.org", evidence: "strong",
      what: "teaches children at the level they are actually at, the strongest evidence in education",
      what_el: "διδάσκει τα παιδιά στο επίπεδο που πραγματικά βρίσκονται, με την ισχυρότερη τεκμηρίωση στην εκπαίδευση" },
  ],
  "loneliness": [
    { org: "StrongMinds", url: "https://strongminds.org", evidence: "strong",
      what: "treats depression with low-cost group talk therapy",
      what_el: "θεραπεύει την κατάθλιψη με ομαδική ψυχοθεραπεία χαμηλού κόστους" },
    { org: "Friendship Bench", url: "https://www.friendshipbenchzimbabwe.org", evidence: "strong",
      what: "trains lay counselors, famously grandmothers, to deliver proven talk therapy",
      what_el: "εκπαιδεύει «γιαγιάδες» της κοινότητας να προσφέρουν τεκμηριωμένη ψυχολογική στήριξη" },
  ],
  "homelessness": [
    { org: "Community Solutions", url: "https://community.solutions", evidence: "strong",
      what: "drives Housing First to measurable zero in dozens of communities",
      what_el: "εφαρμόζει το Housing First με μετρήσιμα αποτελέσματα σε δεκάδες κοινότητες" },
  ],
  "refugees": [
    { org: "International Rescue Committee", url: "https://www.rescue.org", evidence: "strong",
      what: "delivers cash assistance so displaced families choose what they need most",
      what_el: "παρέχει βοήθεια σε μετρητά ώστε οι εκτοπισμένες οικογένειες να επιλέγουν ό,τι χρειάζονται περισσότερο" },
    { org: "UNHCR", url: "https://www.unhcr.org", evidence: "strong",
      what: "protects and resettles refugees worldwide",
      what_el: "προστατεύει και επανεγκαθιστά πρόσφυγες παγκοσμίως" },
  ],
  "climate-change": [
    { org: "Clean Air Task Force", url: "https://www.catf.us", evidence: "strong",
      what: "pushes the highest-leverage clean energy policy and technology",
      what_el: "προωθεί πολιτικές και τεχνολογίες καθαρής ενέργειας με τη μεγαλύτερη μόχλευση" },
  ],
  "air-pollution": [
    { org: "Clean Air Fund", url: "https://www.cleanairfund.org", evidence: "promising",
      what: "funds clean-air policy and open monitoring worldwide",
      what_el: "χρηματοδοτεί πολιτικές καθαρού αέρα και ανοιχτή παρακολούθηση παγκοσμίως" },
  ],
  "gender-inequality": [
    { org: "Educate Girls", url: "https://www.educategirls.ngo", evidence: "strong",
      what: "gets out-of-school girls in rural India enrolled and learning",
      what_el: "εγγράφει και κρατά στο σχολείο κορίτσια στην αγροτική Ινδία" },
    { org: "Girls Not Brides", url: "https://www.girlsnotbrides.org", evidence: "promising",
      what: "the global partnership working to end child marriage",
      what_el: "η παγκόσμια συμμαχία για τον τερματισμό των γάμων ανηλίκων" },
  ],
  "factory-farming": [
    { org: "The Humane League", url: "https://thehumaneleague.org", evidence: "strong",
      what: "wins corporate commitments that take millions of animals out of cages",
      what_el: "κερδίζει εταιρικές δεσμεύσεις που βγάζουν εκατομμύρια ζώα από κλουβιά" },
    { org: "Good Food Institute", url: "https://gfi.org", evidence: "promising",
      what: "advances the science and policy of alternative proteins",
      what_el: "προωθεί την επιστήμη και τις πολιτικές των εναλλακτικών πρωτεϊνών" },
  ],
  "preventable-blindness": [
    { org: "Fred Hollows Foundation", url: "https://www.hollows.org", evidence: "strong",
      what: "restores sight with high-volume, low-cost cataract surgery",
      what_el: "αποκαθιστά την όραση με επεμβάσεις καταρράκτη χαμηλού κόστους σε μεγάλη κλίμακα" },
    { org: "Sightsavers", url: "https://www.sightsavers.org", evidence: "strong",
      what: "fights trachoma and avoidable blindness across dozens of countries",
      what_el: "καταπολεμά το τράχωμα και την αποτρέψιμη τύφλωση σε δεκάδες χώρες" },
  ],
  "pandemic-preparedness": [
    { org: "CEPI", url: "https://cepi.net", evidence: "promising",
      what: "builds the vaccine platforms to stop the next outbreak within 100 days",
      what_el: "χτίζει τις πλατφόρμες εμβολίων για να σταματήσει η επόμενη πανδημία μέσα σε 100 ημέρες" },
  ],
  "tuberculosis": [
    { org: "TB Alliance", url: "https://www.tballiance.org", evidence: "strong",
      what: "develops the new regimens transforming drug-resistant TB",
      what_el: "αναπτύσσει τα νέα σχήματα που αλλάζουν τη θεραπεία της ανθεκτικής φυματίωσης" },
    { org: "Partners In Health", url: "https://www.pih.org", evidence: "strong",
      what: "finds and treats TB patients in the hardest settings on Earth",
      what_el: "εντοπίζει και θεραπεύει ασθενείς με φυματίωση στα δυσκολότερα περιβάλλοντα του κόσμου" },
  ],
  "lead-poisoning": [
    { org: "LEEP", url: "https://leadelimination.org", evidence: "strong",
      what: "gets lead paint regulated country by country, astonishingly cheaply",
      what_el: "πετυχαίνει ρύθμιση των μολυβδούχων χρωμάτων χώρα προς χώρα, με εντυπωσιακά χαμηλό κόστος" },
    { org: "Pure Earth", url: "https://www.pureearth.org", evidence: "promising",
      what: "cleans up lead sources, from contaminated sites to spices and cookware",
      what_el: "καθαρίζει πηγές μολύβδου, από ρυπασμένες περιοχές μέχρι μπαχαρικά και σκεύη" },
  ],
  "maternal-mortality": [
    { org: "Partners In Health", url: "https://www.pih.org", evidence: "strong",
      what: "builds the emergency obstetric care that stops mothers dying",
      what_el: "χτίζει τη μαιευτική φροντίδα έκτακτης ανάγκης που σώζει μητέρες" },
    { org: "Fistula Foundation", url: "https://fistulafoundation.org", evidence: "strong",
      what: "funds surgeries that repair devastating childbirth injuries",
      what_el: "χρηματοδοτεί επεμβάσεις που αποκαθιστούν σοβαρούς τραυματισμούς τοκετού" },
  ],
  "road-deaths": [
    { org: "Amend", url: "https://www.amend.org", evidence: "promising",
      what: "makes school zones in African cities measurably safer",
      what_el: "κάνει μετρήσιμα ασφαλέστερες τις σχολικές ζώνες σε αφρικανικές πόλεις" },
  ],
  "tobacco": [
    { org: "Campaign for Tobacco-Free Kids", url: "https://www.tobaccofreekids.org", evidence: "strong",
      what: "wins the tobacco taxes and smoke-free laws that save the most lives",
      what_el: "κερδίζει τους φόρους καπνού και τους αντικαπνιστικούς νόμους που σώζουν τις περισσότερες ζωές" },
  ],
  "hiv-aids": [
    { org: "Médecins Sans Frontières", url: "https://www.msf.org", evidence: "strong",
      what: "delivers HIV treatment where health systems are weakest",
      what_el: "παρέχει θεραπεία HIV εκεί όπου τα συστήματα υγείας είναι πιο αδύναμα" },
    { org: "Elizabeth Glaser Pediatric AIDS Foundation", url: "https://www.pedaids.org", evidence: "strong",
      what: "prevents mothers passing HIV to their babies",
      what_el: "αποτρέπει τη μετάδοση του HIV από μητέρες σε μωρά" },
  ],
  "neglected-tropical-diseases": [
    { org: "END Fund", url: "https://end.org", evidence: "strong",
      what: "pools funding for mass treatment against neglected tropical diseases",
      what_el: "συγκεντρώνει πόρους για μαζική θεραπεία κατά των παραμελημένων τροπικών νόσων" },
    { org: "Unlimit Health", url: "https://unlimithealth.org", evidence: "strong",
      what: "leads elimination work on schistosomiasis and worm infections",
      what_el: "ηγείται προσπαθειών εξάλειψης της σχιστοσωμίασης και των παρασιτικών λοιμώξεων" },
  ],
  "corruption": [
    { org: "Transparency International", url: "https://www.transparency.org", evidence: "strong",
      what: "the global network exposing and fighting corruption",
      what_el: "το παγκόσμιο δίκτυο που αποκαλύπτει και καταπολεμά τη διαφθορά" },
    { org: "OCCRP", url: "https://www.occrp.org", evidence: "strong",
      what: "the investigative newsroom behind major cross-border exposés",
      what_el: "το ερευνητικό δίκτυο πίσω από μεγάλες διασυνοριακές αποκαλύψεις" },
  ],
  "ocean-health": [
    { org: "Oceana", url: "https://oceana.org", evidence: "promising",
      what: "wins policy campaigns that rebuild fisheries and protect habitats",
      what_el: "κερδίζει θεσμικές καμπάνιες που ανασυγκροτούν αλιεύματα και προστατεύουν οικοτόπους" },
  ],
};
