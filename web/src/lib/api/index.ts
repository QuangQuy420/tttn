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
  getMyAddresses,
  createMyAddress,
  updateMyAddress,
  deleteMyAddress,
} from "./users";

export { createBrand, deleteBrand, getBrands, updateBrand } from "./brands";
export { analyzeFace, deleteFaceAnalysisHistory, getFaceAnalysisHistory } from "./face";
export { getRecommendations } from "./recommendations";

export {
  createProduct,
  createCategory,
  createVariant,
  deleteProduct,
  deleteCategory,
  deleteProductImage,
  deleteVariant,
  getCategories,
  getProductById,
  getProducts,
  setProductImageThumbnail,
  updateProduct,
  updateCategory,
  updateVariant,
  uploadProductImage,
} from "./products";

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

export {
  createRole,
  deleteRole,
  listPermissions,
  listRoles,
  updateRole,
} from "./roles";

export { assignRoleToUser, listUsers, removeRoleFromUser } from "./admin-users";
export type { AdminUser } from "./admin-users";

export {
  getAdminOrderDetail,
  getAdminOrdersSummary,
  listAdminOrders,
  updateOrderStatusAdmin,
} from "./admin-orders";

export {
  getOrderSagaLogs,
  getSagaLogDays,
  getSagaLogsForDay,
} from "./admin-saga-logs";

export { getSagaSettings, updateSagaSettings } from "./admin-settings";
export type { SagaSettings, UpdateSagaSettingsRequest } from "./admin-settings";
