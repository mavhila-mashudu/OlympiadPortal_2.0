// @ts-nocheck

/**
 * Converts a title to a URL-friendly slug
 * "Hello World! 123" → "hello-world-123"
 */
const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // remove special chars
    .replace(/\s+/g, "-") // spaces to hyphens
    .replace(/-+/g, "-"); // collapse multiple hyphens
};

/**
 * Generates a unique slug by appending a number if slug exists
 * "my-post" → "my-post-2" → "my-post-3" etc
 */
const generateUniqueSlug = async (title, prisma, excludeId = null) => {
  const base = slugify(title);
  let slug = base;
  let count = 1;

  while (true) {
    const existing = await prisma.post.findUnique({
      where: { slug },
    });

    // No conflict found — slug is unique
    if (!existing) break;

    // Same post being updated — slug belongs to this post
    if (excludeId && existing.id === excludeId) break;

    // Conflict — try next number
    slug = `${base}-${++count}`;
  }

  return slug;
};

module.exports = { slugify, generateUniqueSlug };
