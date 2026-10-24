import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

export default function (eleventyConfig) {
  // Decap's media picker normally stores the full "/assets/uploads/x.jpg"
  // path, but some paths through the editor (e.g. pasting a bare name from
  // "Copy Name" into "Replace with URL") only save the filename. Normalize
  // defensively rather than depending on which flow was used to add it.
  eleventyConfig.addFilter("imagePath", (value) => {
    if (!value) return value;
    if (value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://")) {
      return value;
    }
    return `/assets/uploads/${value}`;
  });

  // Converted JPEG 2000/TIFF uploads also have a large version in
  // /assets/zoom (see scripts/convert_uploads.py) that the lightbox loads
  // for zooming in. Empty when there is none; the lightbox then zooms into
  // the page image itself.
  eleventyConfig.addFilter("zoomPath", (value) => {
    if (!value) return "";
    const name = value.split("/").pop();
    return existsSync(`src/assets/zoom/${name}`) ? `/assets/zoom/${name}` : "";
  });

  // Appends a short hash of the file's contents ("/styles.css?v=1a2b3c4d").
  // The host serves CSS/JS with a 4-hour browser cache, so without this a
  // visitor (Safari especially) can pair a fresh page with a stale
  // stylesheet or script after a deploy. The URL now changes whenever the
  // file does, so browsers always fetch the matching version.
  eleventyConfig.addFilter("bust", (url) => {
    const hash = createHash("md5").update(readFileSync(`src${url}`)).digest("hex").slice(0, 8);
    return `${url}?v=${hash}`;
  });

  // Project gallery items can be photos, GIFs or videos — videos need a
  // <video> element instead of an <img>.
  eleventyConfig.addFilter("isVideo", (value) => /\.(mp4|webm|mov|m4v)$/i.test(value || ""));

  // What one gallery entry shows: the file itself, or for a PDF each of
  // its pages, which scripts/convert_uploads.py turns into SVGs (listed in
  // src/_data/pdf.json). A PDF not converted yet shows nothing.
  eleventyConfig.addFilter("galleryFiles", (value, pdfIndex) => {
    if (!/\.pdf$/i.test(value || "")) return [value];
    const name = value.split("/").pop().normalize("NFC");
    return (pdfIndex || {})[name] || [];
  });

  eleventyConfig.addPassthroughCopy("src/styles.css");
  eleventyConfig.addPassthroughCopy("src/script.js");
  // PDFs are shown through their converted pages, so the files themselves
  // are not published (they can also exceed the host's 25 MB file limit).
  eleventyConfig.addPassthroughCopy("src/assets", { filter: (path) => !/\.pdf$/i.test(path) });
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
