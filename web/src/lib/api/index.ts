export { ApiError, apiFetch } from "./client";

export {
  login,
  register,
  forgotPassword,
  resetPassword,
} from "./auth";

export {
  getMyProfile,
  updateMyProfile,
  changePassword,
} from "./users";

export { getBrands } from "./brands";
export { analyzeFace, getFaceAnalysisHistory } from "./face";
export { getRecommendations } from "./recommendations";

export {
  createProduct,
  deleteProduct,
  getCategories,
  getProductById,
  getProducts,
  updateProduct,
  uploadProductImage,
} from "./products";

export type { ImageSlot } from "./products";

export {
  addCartItem,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from "./cart";

export {
  cancelOrder,
  checkout,
  getOrderById,
  getOrders,
} from "./orders";