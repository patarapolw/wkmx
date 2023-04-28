import jieba from "nodejieba";

export default defineEventHandler((event) => {
  const query = getQuery(event);
  let s = String(query.q || "").trim();
  if (!s) {
    throw createError({
      statusCode: 400,
      statusMessage: `"q" is required`,
    });
  }

  return {
    result: jieba.extract(s, 0).map((t) => t.word),
  };
});
