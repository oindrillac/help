const path = require(`path`);
const { createFilePath } = require(`gatsby-source-filesystem`);
const fs = require(`fs`);
const yaml = require(`js-yaml`);
const { nanoid } = require(`nanoid`);

const tocSources = yaml.load(
  fs.readFileSync(`./config/toc-sources.yaml`, `utf-8`)
);

const supportedTemplates = ['MarkdownRemark', 'Mdx'];


exports.createPages = async ({ graphql, actions, reporter }) => {
  const { createPage } = actions;

  const items_query = await graphql(
    `
      {
        navData {
          navItems {
            href
            index
          }
        }
      }
    `
  )

  const items = items_query.data.navData.navItems;
  return Promise.all(
    supportedTemplates.map(async (type) => {
      // Define a template
      const file = path.resolve(`./src/templates/${type}.js`);

      // Get all markdown blog posts sorted by date
      const result = await graphql(
        `
        {
          all${type} {
            nodes {
              id
              fields {
                slug
              }
            }
          }
        }
      `
      );

      if (result.errors) {
        reporter.panicOnBuild(
          `There was an error loading your blog posts`,
          result.errors
        );
        return;
      }

      const posts = result.data[`all${type}`].nodes;

      if (posts.length > 0) {
        posts.forEach((post, index) => {
          const previousPostId = index === 0 ? null : posts[index - 1].id;
          const nextPostId = index === posts.length - 1 ? null : posts[index + 1].id;

          const root = items.find(item => {
            return item.href === post.fields.slug
          })?.index


          createPage({
            path: root ?? post.fields.slug,
            component: file,
            context: {
              id: post.id,
              previousPostId,
              nextPostId,
            },
          });
        });
      }
    })
  )
};

exports.onCreateNode = ({
  node,
  getNode,
  actions: { createNodeField },
  reporter
}) => {
  if (!supportedTemplates.includes(node.internal.type)) {
    return;
  }
  const fileNode = getNode(node.parent);
  const gitRemoteNode = getNode(fileNode.gitRemote___NODE);


  let slug =
    (gitRemoteNode ? `/${gitRemoteNode.sourceInstanceName}` : "") +
    createFilePath({
      node,
      getNode,
      basePath: "",
      trailingSlash: false,
    }) +
    (fileNode.name !== "index" ? `.${fileNode.extension}` : "");


  const srcLink =
    (gitRemoteNode
      ? `${gitRemoteNode.webLink}/blob/master/`
      : `${
          getNode("Site").siteMetadata.srcLinkDefault
        }/blob/master/content/`) + fileNode.relativePath;

  createNodeField({ node, name: "slug", value: slug });
  createNodeField({ node, name: "srcLink", value: srcLink });

  reporter.info(`node created: ${slug}`);
};

// Create new node collection `NavData` for navigation, parsing table of content files `tocSources`
exports.sourceNodes = ({
  actions: { createNode },
  createNodeId,
  createContentDigest,
  reporter,
}) => {
  const navItems = tocSources.flatMap((tocSource) => {
    const fileLocation = `${__dirname}/${tocSource}`;
    if (!fs.existsSync(fileLocation)) {
      reporter.error(
        `Table of Contents file ${fileLocation} missing.  Skipped.`
      );
      return [];
    }
    const toc = yaml.load(fs.readFileSync(fileLocation, `utf-8`));

    return toc.map((navItem) => ({
      ...navItem,
      id: navItem.id || nanoid(),
      links:
        navItem.links &&
        navItem.links.map((link) => ({ ...link, id: link.id || nanoid() })),
    }));
  });

  createNode({
    id: createNodeId(`NavData`),
    navItems,
    internal: {
      type: `NavData`,
      contentDigest: createContentDigest(navItems),
    },
  });

  reporter.success("nodes created: NavData");
};

exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions;

  // Explicitly define the siteMetadata {} object
  // This way those will always be defined even if removed from gatsby-config.js

  // Also explicitly define the Markdown frontmatter
  // This way the "MarkdownRemark" queries will return `null` even when no
  // blog posts are stored inside "content/blog" instead of returning an error
  createTypes(`
    type Mdx implements Node @infer{
      fields: Fields
      frontmatter: Frontmatter
    }

    type MarkdownRemark implements Node @infer{
      fields: Fields
      frontmatter: Frontmatter
    }

   type Frontmatter {
      title: String
      description: String
   }

    type Fields {
      slug: String
      srcLink: String
    }

    type NavDataNavItemsLinks {
      id: String
      label: String
      remote: String
      href: String
    }

    type NavDataNavItems {
      id: String
      label: String
      href: String
      index: String
    }
  `);
};
