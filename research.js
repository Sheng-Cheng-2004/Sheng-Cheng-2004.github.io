const projectList = document.getElementById("project-list");

if (projectList && Array.isArray(window.RESEARCH_PROJECTS)) {
  const makeElement = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = value || "";
    return element;
  };

  const addSeparator = (parent) => {
    const separator = makeElement("span", "", "·");
    separator.setAttribute("aria-hidden", "true");
    parent.append(separator);
  };

  const addLink = (parent, label, href) => {
    if (typeof href !== "string" || !/^(https?:\/\/|assets\/)/.test(href)) return;
    const link = makeElement("a", "paper-link", label);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    parent.append(link);
  };

  window.RESEARCH_PROJECTS.forEach((project, index) => {
    const article = makeElement("article", "project");
    article.append(makeElement("h3", "", project.title));

    const byline = makeElement("p", "project-byline");
    (project.authors || []).forEach((author, authorIndex) => {
      if (authorIndex) byline.append(document.createTextNode(", "));
      const name = typeof author === "string" ? author : author.name;
      byline.append(typeof author === "object" && author.featured
        ? makeElement("b", "", name)
        : document.createTextNode(name));
    });
    if (project.meta) {
      addSeparator(byline);
      byline.append(makeElement("span", "project-type", project.meta));
    }
    if (project.date) {
      addSeparator(byline);
      byline.append(document.createTextNode(project.date));
    }
    article.append(byline);

    const actions = makeElement("div", "project-actions");
    if (project.abstract) {
      const abstractId = `project-abstract-${index}`;
      const button = makeElement("button", "abstract-toggle", "Abstract");
      button.type = "button";
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-controls", abstractId);
      actions.append(button);

      const content = makeElement("div", "abstract-content");
      content.id = abstractId;
      content.hidden = true;
      content.append(makeElement("p", "", project.abstract));
      button.addEventListener("click", () => {
        const isOpen = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", String(!isOpen));
        content.hidden = isOpen;
      });
      article.append(actions, content);
    } else {
      article.append(actions);
    }

    if (project.pdf) addLink(actions, "View Paper", project.pdf);
    (project.links || []).forEach(({ label, url }) => addLink(actions, label, url));
    if (project.description) article.append(makeElement("p", "project-description", project.description));
    projectList.append(article);
  });
}
