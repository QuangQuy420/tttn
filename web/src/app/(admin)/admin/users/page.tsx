"use client";

import { useEffect, useState } from "react";
import {
    ApiError,
    assignRoleToUser,
    listRoles,
    listUsers,
    removeRoleFromUser,
    type AdminUser,
} from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getAccessToken } from "@/lib/auth/session";
import type { Role } from "@/types/user";

const PAGE_SIZE = 20;

// Users admin page (T22, AC2) — list users (email, username, roles) with pagination, and a
// "manage roles" modal per user that assigns/removes roles via a multi-select, reusing
// assignRoleToUser/removeRoleFromUser (already implemented) and listRoles to populate the
// picker. Modeled on admin/products/page.tsx's search+table layout and admin/roles/page.tsx's
// modal-based edit pattern.
export default function AdminUsersPage() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [roles, setRoles] = useState<Role[]>([]);
    const [rolesError, setRolesError] = useState<string | null>(null);

    const [managingUser, setManagingUser] = useState<AdminUser | null>(null);

    async function run(targetPage: number) {
        setIsLoading(true);
        setLoadError(null);

        const token = getAccessToken();
        if (!token) {
            setLoadError("Vui lòng đăng nhập lại.");
            setIsLoading(false);
            return;
        }

        try {
            const response = await listUsers(token, targetPage, PAGE_SIZE);
            setUsers(response.data.items);
            setTotal(response.data.total);
            setTotalPages(response.data.totalPages);
            setPage(response.data.page);
        } catch (err) {
            setLoadError(
                err instanceof ApiError ? err.message : "Không thể tải danh sách người dùng.",
            );
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        let cancelled = false;

        async function runEffect() {
            setIsLoading(true);
            setLoadError(null);

            const token = getAccessToken();
            if (!token) {
                if (!cancelled) {
                    setLoadError("Vui lòng đăng nhập lại.");
                    setIsLoading(false);
                }
                return;
            }

            try {
                const response = await listUsers(token, page, PAGE_SIZE);
                if (!cancelled) {
                    setUsers(response.data.items);
                    setTotal(response.data.total);
                    setTotalPages(response.data.totalPages);
                    setPage(response.data.page);
                }
            } catch (err) {
                if (!cancelled) {
                    setLoadError(
                        err instanceof ApiError
                            ? err.message
                            : "Không thể tải danh sách người dùng.",
                    );
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        void runEffect();

        return () => {
            cancelled = true;
        };
    }, [page]);

    useEffect(() => {
        let cancelled = false;

        async function loadRoles() {
            const token = getAccessToken();
            if (!token) return;
            try {
                const response = await listRoles(token);
                if (!cancelled) setRoles(response.data);
            } catch (err) {
                if (!cancelled) {
                    setRolesError(
                        err instanceof ApiError
                            ? err.message
                            : "Không thể tải danh sách vai trò.",
                    );
                }
            }
        }

        void loadRoles();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <>
            <header className="admin-header">
                <div className="admin-header__title">Quản lý khách hàng</div>
                <div className="admin-header__avatar">AD</div>
            </header>

            <section className="admin-content">
                {rolesError && <ErrorState message={rolesError} />}

                {isLoading && <LoadingState label="Đang tải người dùng..." />}
                {!isLoading && loadError && <ErrorState message={loadError} />}
                {!isLoading && !loadError && (
                    <div className="admin-table">
                        <div className="admin-table__row admin-table__row--head">
                            <span>Email</span>
                            <span>Tên đăng nhập</span>
                            <span>Vai trò</span>
                            <span></span>
                        </div>
                        {users.map((user) => (
                            <div key={user.id} className="admin-table__row admin-table__row--body">
                                <span>{user.email}</span>
                                <span>{user.username}</span>
                                <span>
                                    {user.roles.length > 0 ? user.roles.join(", ") : "Chưa có vai trò"}
                                </span>
                                <div className="admin-table__actions">
                                    <button
                                        type="button"
                                        className="btn btn--outline btn--small"
                                        onClick={() => setManagingUser(user)}
                                    >
                                        Quản lý vai trò
                                    </button>
                                </div>
                            </div>
                        ))}
                        {users.length === 0 && (
                            <div className="admin-table__empty">Chưa có người dùng nào.</div>
                        )}
                    </div>
                )}

                {!isLoading && !loadError && totalPages > 1 && (
                    <div className="orders-page__pagination">
                        <button
                            type="button"
                            className="btn btn--outline btn--small"
                            onClick={() => run(Math.max(1, page - 1))}
                            disabled={page <= 1}
                        >
                            Trang trước
                        </button>
                        <span>
                            Trang {page} / {totalPages} ({total} người dùng)
                        </span>
                        <button
                            type="button"
                            className="btn btn--outline btn--small"
                            onClick={() => run(Math.min(totalPages, page + 1))}
                            disabled={page >= totalPages}
                        >
                            Trang sau
                        </button>
                    </div>
                )}
            </section>

            {managingUser && (
                <ManageUserRolesModal
                    user={managingUser}
                    roles={roles}
                    onClose={() => setManagingUser(null)}
                    onChanged={async (updatedUser) => {
                        setManagingUser(updatedUser);
                        setUsers((current) =>
                            current.map((u) => (u.id === updatedUser.id ? updatedUser : u)),
                        );
                    }}
                />
            )}
        </>
    );
}

interface ManageUserRolesModalProps {
    user: AdminUser;
    roles: Role[];
    onClose: () => void;
    onChanged: (updatedUser: AdminUser) => void | Promise<void>;
}

function ManageUserRolesModal({ user, roles, onClose, onChanged }: ManageUserRolesModalProps) {
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [pendingRoleId, setPendingRoleId] = useState<string | null>(null);

    const assignedRoleIds = new Set(
        roles.filter((role) => user.roles.includes(role.name)).map((role) => role.id),
    );

    async function handleToggle(role: Role) {
        const token = getAccessToken();
        if (!token) {
            setSubmitError("Bạn cần đăng nhập lại để thực hiện thao tác này.");
            return;
        }

        setSubmitError(null);
        setPendingRoleId(role.id);
        try {
            const isAssigned = assignedRoleIds.has(role.id);
            const response = isAssigned
                ? await removeRoleFromUser(token, user.id, role.id)
                : await assignRoleToUser(token, user.id, role.id);
            await onChanged(response.data);
        } catch (err) {
            setSubmitError(
                err instanceof ApiError ? err.message : "Không thể cập nhật vai trò. Vui lòng thử lại.",
            );
        } finally {
            setPendingRoleId(null);
        }
    }

    return (
        <div className="modal-overlay" role="presentation" onClick={onClose}>
            <div
                className="modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="manage-user-roles-heading"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal__header">
                    <h2 id="manage-user-roles-heading">Quản lý vai trò — {user.email}</h2>
                    <button type="button" className="modal__close" onClick={onClose} aria-label="Đóng">
                        ×
                    </button>
                </div>

                <section aria-label="Chọn vai trò" className="modal__section">
                    <p className="modal__section-label">Vai trò</p>
                    {roles.length === 0 ? (
                        <p>Chưa có vai trò nào trong hệ thống.</p>
                    ) : (
                        <ul className="admin-permission-grid">
                            {roles.map((role) => (
                                <li key={role.id} className="admin-permission-item">
                                    <label className="admin-permission-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={assignedRoleIds.has(role.id)}
                                            disabled={pendingRoleId === role.id}
                                            onChange={() => handleToggle(role)}
                                        />
                                        <span>
                                            <strong>{role.name}</strong>
                                            {role.description && (
                                                <span className="admin-permission-item__description">
                                                    {" "}
                                                    — {role.description}
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {submitError && (
                    <p role="alert" className="error-state">
                        {submitError}
                    </p>
                )}

                <div className="modal__actions">
                    <button type="button" className="btn btn--primary" onClick={onClose}>
                        Xong
                    </button>
                </div>
            </div>
        </div>
    );
}
