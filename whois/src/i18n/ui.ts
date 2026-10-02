export const LANGUAGES = ['en', 'fr'] as const;
export type Lang = (typeof LANGUAGES)[number];
export const DEFAULT_LANG: Lang = 'en';

export const LANGUAGE_NAMES: Record<Lang, string> = {
  en: 'English',
  fr: 'Français',
};

/**
 * Static UI copy. Content lives in `src/data/*.json`; this file only holds
 * chrome (navigation, buttons, section headings) so translators touch one place.
 */
export const ui = {
  'nav.home': { en: 'Home', fr: 'Accueil' },
  'nav.about': { en: 'About', fr: 'À propos' },
  'nav.experience': { en: 'Experience', fr: 'Parcours' },
  'nav.projects': { en: 'Projects', fr: 'Projets' },
  'nav.writing': { en: 'Writing', fr: 'Articles' },
  'nav.speaking': { en: 'Speaking', fr: 'Conférences' },
  'nav.contact': { en: 'Contact', fr: 'Contact' },
  'nav.resume': { en: 'Résumé', fr: 'CV' },
  'nav.skipToContent': { en: 'Skip to content', fr: 'Aller au contenu' },
  'nav.menu': { en: 'Menu', fr: 'Menu' },
  'nav.close': { en: 'Close', fr: 'Fermer' },

  'theme.toggle': { en: 'Toggle colour theme', fr: 'Changer de thème' },
  'lang.switch': { en: 'Switch language', fr: 'Changer de langue' },

  'palette.open': { en: 'Search', fr: 'Rechercher' },
  'palette.placeholder': {
    en: 'Search pages, projects, articles, talks…',
    fr: 'Rechercher pages, projets, articles, conférences…',
  },
  'palette.empty': { en: 'No results', fr: 'Aucun résultat' },
  'palette.hint': { en: 'to open', fr: 'pour ouvrir' },
  'palette.close': { en: 'Close search', fr: 'Fermer la recherche' },
  'palette.group.pages': { en: 'Pages', fr: 'Pages' },
  'palette.group.projects': { en: 'Projects', fr: 'Projets' },
  'palette.group.articles': { en: 'Articles', fr: 'Articles' },
  'palette.group.talks': { en: 'Talks', fr: 'Conférences' },

  'home.intro': { en: 'Currently', fr: 'Actuellement' },
  'home.latestWriting': { en: 'Latest writing', fr: 'Derniers articles' },
  'home.nextTalks': { en: 'Next on stage', fr: 'Prochainement sur scène' },
  'home.selectedWork': { en: 'Selected work', fr: 'Travaux sélectionnés' },
  'home.viewAll': { en: 'View all', fr: 'Tout voir' },
  'home.getInTouch': { en: 'Get in touch', fr: 'Me contacter' },
  'home.readMore': { en: 'More about me', fr: 'En savoir plus' },

  'stats.countries': { en: 'Countries', fr: 'Pays' },
  'stats.customers': { en: 'Customers', fr: 'Clients' },
  'stats.talks': { en: 'Talks', fr: 'Conférences' },
  'stats.articles': { en: 'Articles', fr: 'Articles' },
  'stats.years': { en: 'Years in tech', fr: 'Ans dans la tech' },

  'about.title': { en: 'About', fr: 'À propos' },
  'about.whereFrom': { en: 'From', fr: 'Origine' },
  'about.whereNow': { en: 'Based in', fr: 'Basé à' },
  'about.languages': { en: 'Languages', fr: 'Langues' },
  'about.howIWork': { en: 'How I work', fr: 'Ma façon de travailler' },
  'about.funFacts': { en: 'Off the clock', fr: 'Hors du travail' },
  'about.education': { en: 'Education', fr: 'Formation' },
  'about.community': { en: 'Community and advisory', fr: 'Communauté et conseil' },
  'about.badges': { en: 'Badges and certifications', fr: 'Badges et certifications' },
  'about.badgesOn': { en: 'Verified on Credly', fr: 'Vérifiés sur Credly' },

  'experience.title': { en: 'Experience', fr: 'Parcours' },
  'experience.present': { en: 'Present', fr: 'Aujourd’hui' },
  'experience.highlights': { en: 'Highlights', fr: 'Points clés' },
  'experience.downloadResume': { en: 'Download résumé', fr: 'Télécharger le CV' },

  'projects.title': { en: 'Projects', fr: 'Projets' },
  'projects.lead': {
    en: 'A selection of the engagements I have led or contributed to, plotted where they happened. Not an exhaustive list — these are the ones with the most significant outcomes.',
    fr: 'Une sélection des missions que j’ai menées ou auxquelles j’ai contribué, situées là où elles se sont déroulées. Liste non exhaustive : ce sont celles dont les résultats ont été les plus significatifs.',
  },
  'projects.filterIndustry': { en: 'Industry', fr: 'Secteur' },
  'projects.filterYear': { en: 'Year', fr: 'Année' },
  'projects.filterAll': { en: 'All', fr: 'Tous' },
  'projects.reset': { en: 'Reset filters', fr: 'Réinitialiser' },
  'projects.showing': { en: 'Showing', fr: 'Affichage de' },
  'projects.of': { en: 'of', fr: 'sur' },
  'projects.mapHint': {
    en: 'Hover or focus a pin for engagement details. Use Tab to move between pins, the buttons or ctrl + scroll to zoom, and drag to pan.',
    fr: 'Survolez ou ciblez une épingle pour le détail. Tab pour naviguer, les boutons ou ctrl + molette pour zoomer, et glissez pour vous déplacer.',
  },
  'projects.zoomIn': { en: 'Zoom in', fr: 'Zoomer' },
  'projects.zoomOut': { en: 'Zoom out', fr: 'Dézoomer' },
  'projects.resetZoom': { en: 'Reset zoom', fr: 'Réinitialiser le zoom' },
  'projects.listView': { en: 'List', fr: 'Liste' },
  'projects.mapView': { en: 'Map', fr: 'Carte' },
  'projects.confidential': { en: 'Confidential customer', fr: 'Client confidentiel' },
  'projects.outcome': { en: 'Outcome', fr: 'Résultat' },
  'projects.none': { en: 'No projects match these filters.', fr: 'Aucun projet ne correspond.' },

  'writing.title': { en: 'Writing', fr: 'Articles' },
  'writing.lead': {
    en: 'Articles, posts and documentation I have published.',
    fr: 'Articles, publications et documentation que j’ai publiés.',
  },
  'writing.readOn': { en: 'Read on', fr: 'Lire sur' },
  'writing.featured': { en: 'Featured', fr: 'À la une' },
  'writing.filterSource': { en: 'Source', fr: 'Source' },
  'writing.none': { en: 'Nothing published here yet.', fr: 'Rien de publié pour le moment.' },

  'speaking.title': { en: 'Speaking', fr: 'Conférences' },
  'speaking.lead': {
    en: 'Conferences, user groups and webinars where I have shared the work.',
    fr: 'Conférences, groupes d’utilisateurs et webinaires où j’ai partagé mon travail.',
  },
  'speaking.upcoming': { en: 'Upcoming', fr: 'À venir' },
  'speaking.past': { en: 'Past', fr: 'Passées' },
  'speaking.noUpcoming': {
    en: 'Nothing scheduled right now — invitations welcome.',
    fr: 'Rien de prévu pour le moment — les invitations sont les bienvenues.',
  },
  'speaking.slides': { en: 'Slides', fr: 'Diapositives' },
  'speaking.recording': { en: 'Recording', fr: 'Enregistrement' },
  'speaking.eventPage': { en: 'Event page', fr: 'Page de l’événement' },
  'speaking.addToCalendar': { en: 'Add to calendar', fr: 'Ajouter au calendrier' },
  'speaking.filterFormat': { en: 'Filter by format', fr: 'Filtrer par format' },
  'speaking.filterAll': { en: 'All', fr: 'Toutes' },
  'speaking.noneOfType': {
    en: 'Nothing of this format in this section.',
    fr: 'Rien de ce format dans cette section.',
  },
  'speaking.countdownDays': { en: 'days away', fr: 'jours restants' },
  'speaking.today': { en: 'Today', fr: 'Aujourd’hui' },

  'contact.title': { en: 'Contact', fr: 'Contact' },
  'contact.lead': {
    en: 'The fastest ways to reach me, and what I am open to right now.',
    fr: 'Les moyens les plus rapides de me joindre, et ce à quoi je suis ouvert actuellement.',
  },
  'contact.messageOnLinkedIn': { en: 'Message me on LinkedIn', fr: 'M’écrire sur LinkedIn' },
  'contact.responseTime': { en: 'Typical response', fr: 'Délai de réponse' },
  'contact.elsewhere': { en: 'Elsewhere', fr: 'Ailleurs' },
  'contact.openTo': { en: 'Open to', fr: 'Ouvert à' },
  'contact.openToWork': { en: 'New roles', fr: 'Nouvelles opportunités' },
  'contact.openToSpeaking': { en: 'Speaking invitations', fr: 'Invitations à parler' },
  'contact.openToAdvising': { en: 'Startup advisory', fr: 'Conseil aux startups' },
  'contact.openToBoard': { en: 'Board positions', fr: 'Postes d’administrateur' },
  'contact.yes': { en: 'Yes', fr: 'Oui' },
  'contact.no': { en: 'Not right now', fr: 'Pas actuellement' },

  'resume.title': { en: 'Résumé', fr: 'CV' },
  'resume.print': { en: 'Print / save as PDF', fr: 'Imprimer / enregistrer en PDF' },
  'resume.profile': { en: 'Profile', fr: 'Profil' },
  'resume.experience': { en: 'Experience', fr: 'Expérience' },
  'resume.speaking': { en: 'Selected speaking', fr: 'Conférences sélectionnées' },
  'resume.writing': { en: 'Selected writing', fr: 'Publications sélectionnées' },
  'resume.skills': { en: 'Skills', fr: 'Compétences' },
  'resume.education': { en: 'Education', fr: 'Formation' },

  'status.label': { en: 'Work status', fr: 'Statut professionnel' },
  'status.openToWork': { en: 'Open to new roles', fr: 'Ouvert aux nouvelles opportunités' },
  'status.notLooking': { en: 'Not seeking a new role', fr: 'Pas en recherche de poste' },

  '404.title': { en: 'Page not found', fr: 'Page introuvable' },
  '404.lead': {
    en: 'That page does not exist. Try one of these instead.',
    fr: 'Cette page n’existe pas. Essayez l’une de celles-ci.',
  },
  '404.home': { en: 'Back home', fr: 'Retour à l’accueil' },

  'footer.builtWith': { en: 'Built with', fr: 'Construit avec' },
  'footer.source': { en: 'Source', fr: 'Code source' },
  'footer.updated': { en: 'Last updated', fr: 'Dernière mise à jour' },
} as const satisfies Record<string, Record<Lang, string>>;

export type UiKey = keyof typeof ui;
