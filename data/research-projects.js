// Add or edit projects here. Optional fields: abstract, description, pdf, links.
// Authors can be strings or { name, featured: true } for highlighted names.
window.RESEARCH_PROJECTS = [
  {
    id: "choice-branching",
    title: "Choice Branching, Memory and Response Time",
    authors: [{ name: "Sheng Cheng", featured: true }],
    meta: "Undergraduate Thesis",
    date: "2026",
    abstract: [
      "This paper introduces the Choice Branching Model (CB), a stochastic choice framework that incorporates memory and memory-dependent search into consumer decision-making.",
      "Unlike classical models such as the random utility model and multinomial logit model, which treat choice as a one-shot selection, CB models choice as a sequential search-and-branch process.",
      "Consumers search for their most preferred alternative; if it is unavailable, they stochastically branch to another alternative and continue searching until an available option is found.",
      "The model allows consumers to recall a limited number of previously searched alternatives, with branching behavior determined by memory.",
      "We show that different memory levels generate a hierarchy of models with increasing explanatory power and that MNL, Markov chain models, and RUM arise as special cases.",
      "We further incorporate response time as an observable outcome, demonstrating that it provides information about both preferences and memory: lower memory levels lead to longer search times, while more preferred alternatives are selected more quickly.",
      "Response-time data improve model identification, especially in limited-data settings.",
      "Finally, we develop a maximum likelihood estimation procedure and evaluate its performance through numerical experiments using synthetic data.",
    ].join(" "),
    pdf: "assets/papers/choice-branching.pdf",
    links: [],
  },
  {
    id: "polyhedral-approach",
    title: "A Polyhedral Approach to Stochastic Choice Models",
    authors: [
      "Mohit Tawarmalani",
      "Taotao He",
      { name: "Sheng Cheng", featured: true },
    ],
    meta: "Working in Progress",
    date: "",
    abstract: "",
    pdf: "assets/papers/polyhedral-approach.pdf",
    links: [],
  },
];
