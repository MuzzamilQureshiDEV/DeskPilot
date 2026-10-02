import { searchProductsSchema } from "@/lib/ai/schemas";
import { productView } from "@/lib/ai/tools/views";
import { defineTool } from "@/lib/ai/tools/types";

export const searchProducts = defineTool({
  schema: searchProductsSchema,
  definition: {
    name: "search_products",
    description:
      "Search the store's products by keywords (name, type, material, use). Returns description, price, and stock per size. Use it for questions about products, sizes, availability or materials.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A few keywords, e.g. \"rain jacket\" or \"merino socks\"." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  async run(input, ctx) {
    const products = await ctx.provider.searchProducts(input.query);
    if (products.length === 0) {
      return {
        products: [],
        note: "No matching products. Don't suggest products that weren't returned. Try other keywords, or say you couldn't find it.",
      };
    }
    return { products: products.map(productView) };
  },
});
