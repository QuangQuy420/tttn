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
export { analyzeFace } from "./face";

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