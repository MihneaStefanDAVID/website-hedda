import markdownIt from "markdown-it";

const md = markdownIt({ html: false, breaks: true, linkify: true });

export default function (eleventyConfig) {
  eleventyConfig.addFilter("markdown", (value) => md.render(value || ""));

  eleventyConfig.addPassthroughCopy("src/styles.css");
  eleventyConfig.addPassthroughCopy("src/script.js");
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/admin");

  const sortedProjects = (api) =>
    api.getFilteredByGlob("src/projects/*.md").sort((a, b) => a.data.order - b.data.order);

  eleventyConfig.addCollection("projects", (api) => sortedProjects(api));

  // The hero can only ever morph exactly 4 rectangles into 4 cards — see
  // script.js's DOM contract (#project-grid must contain exactly 4
  // .project-card elements). Split here, in JS, rather than relying on a
  // template-language slice filter of uncertain behavior.
  eleventyConfig.addCollection("heroProjects", (api) => sortedProjects(api).slice(0, 4));
  eleventyConfig.addCollection("remainingProjects", (api) => sortedProjects(api).slice(4));

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
    },
  };
}
