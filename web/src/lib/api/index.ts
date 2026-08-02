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

export { getBrands } from "./brands";
export { analyzeFace, deleteFaceAnalysisHistory, getFaceAnalysisHistory } from "./face";
export { getRecommendations } from "./recommendations";

export {
  createProduct,
  createVariant,
  deleteProduct,
  deleteVariant,
  getCategories,
  getProductById,
  getProducts,
  updateProduct,
  updateVariant,
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