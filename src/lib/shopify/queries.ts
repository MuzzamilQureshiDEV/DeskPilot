// Admin GraphQL queries (API version pinned in config.ts). Validated against
// a live store on 2026-10-04. Keep each query's cost well under 1,000 points.

const MONEY = "shopMoney { amount currencyCode }";

const ORDER_SUMMARY_FIELDS = `
  id
  name
  email
  createdAt
  cancelledAt
  displayFinancialStatus
  displayFulfillmentStatus
  customer { displayName }
  totalPriceSet { ${MONEY} }
`;

export const FIND_ORDERS = `
  query FindOrders($query: String!) {
    orders(first: 10, query: $query, sortKey: CREATED_AT, reverse: true) {
      nodes { ${ORDER_SUMMARY_FIELDS} }
    }
  }
`;

export const GET_ORDER = `
  query GetOrder($id: ID!) {
    order(id: $id) {
      ${ORDER_SUMMARY_FIELDS}
      subtotalPriceSet { ${MONEY} }
      totalShippingPriceSet { ${MONEY} }
      totalRefundedSet { ${MONEY} }
      shippingAddress { name address1 address2 city province zip country countryCodeV2 }
      lineItems(first: 50) {
        nodes {
          id
          title
          variantTitle
          sku
          quantity
          refundableQuantity
          unfulfilledQuantity
          originalUnitPriceSet { ${MONEY} }
        }
      }
      fulfillments(first: 10) {
        id
        status
        displayStatus
        createdAt
        inTransitAt
        estimatedDeliveryAt
        deliveredAt
        trackingInfo(first: 1) { company number url }
        fulfillmentLineItems(first: 50) { nodes { quantity lineItem { id } } }
      }
      refunds(first: 10) {
        id
        createdAt
        note
        totalRefundedSet { ${MONEY} }
      }
    }
  }
`;

export const SEARCH_PRODUCTS = `
  query SearchProducts($query: String!) {
    products(first: 5, query: $query, sortKey: RELEVANCE) {
      nodes {
        id
        title
        description(truncateAt: 600)
        productType
        tags
        tracksInventory
        totalInventory
        priceRangeV2 {
          minVariantPrice { amount currencyCode }
          maxVariantPrice { amount currencyCode }
        }
        variants(first: 30) {
          nodes { id title sku price inventoryQuantity availableForSale }
        }
      }
    }
  }
`;
