"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AddressBook } from "@/components/account/AddressBook";
import { useAddresses } from "@/hooks/useAddresses";
import {
    getMyProfile,
    updateMyProfile,
} from "@/lib/api";
import {
    getAccessToken,
    removeAccessToken,
} from "@/lib/auth/session";
import type { UserProfile } from "@/types/user";
import { ApiError } from "@/lib/api";

export default function ProfilePage() {
    const router = useRouter();
    const {
        addresses,
        isLoading: isLoadingAddresses,
        error: addressesError,
        refetch: refetchAddresses,
    } = useAddresses();

    const [profile, setProfile] = useState<UserProfile | null>(null);

    const [fullName, setFullName] = useState("");
    const [phone, setPhone] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [dateOfBirth, setDateOfBirth] = useState("");

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    useEffect(() => {
        async function loadProfile() {
            const token = getAccessToken();

            if (!token) {
                router.replace("/login");
                return;
            }

            try {
                const response = await getMyProfile(token);
                const user = response.data;

                setProfile(user);
                setFullName(user.fullName ?? "");
                setPhone(user.phone ?? "");
                setAvatarUrl(user.avatarUrl ?? "");
                setDateOfBirth(user.dateOfBirth ?? "");
            } catch (err) {
                if (err instanceof ApiError && err.status === 401) {
                    removeAccessToken();
                    router.replace("/login");
                    return;
                }

                setError(
                    err instanceof ApiError
                        ? err.message
                        : "Không thể tải thông tin người dùng.",
                );
            } finally {
                setLoading(false);
            }
        }

        void loadProfile();
    }, [router]);

    async function handleUpdateProfile(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        const token = getAccessToken();

        if (!token) {
            router.replace("/login");
            return;
        }

        setSaving(true);
        setError("");
        setMessage("");

        try {
            const response = await updateMyProfile(token, {
                fullName,
                phone,
                avatarUrl,
                dateOfBirth: dateOfBirth || undefined,
            });

            setProfile(response.data);
            setMessage("Cập nhật thông tin thành công.");
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.message
                    : "Cập nhật thông tin thất bại.",
            );
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <main className="profile-page">
                <p>Đang tải thông tin...</p>
            </main>
        );
    }

    if (!profile) {
        return (
            <main className="profile-page">
                <p>{error || "Không tìm thấy thông tin người dùng."}</p>
            </main>
        );
    }

    return (
        <main className="profile-page">
            <section className="profile-summary">
                <div>
                    <p className="profile-summary__eyebrow">
                        Tài khoản của bạn
                    </p>

                    <h1>Thông tin cá nhân</h1>

                    <p className="profile-summary__description">
                        Quản lý thông tin liên hệ và hồ sơ cá nhân.
                    </p>
                </div>

                <div className="profile-summary__identity">
                    <div className="profile-summary__avatar">
                        {profile.fullName?.trim()?.charAt(0).toUpperCase() ||
                            profile.username.charAt(0).toUpperCase()}
                    </div>

                    <div>
                        <strong>
                            {profile.fullName || profile.username}
                        </strong>
                        <span>{profile.email}</span>
                    </div>
                </div>
            </section>

            <section className="profile-details">
                <h2>Thông tin tài khoản</h2>

                <div className="profile-details__grid">
                    <div className="profile-detail">
                        <span>Tên đăng nhập</span>
                        <strong>{profile.username}</strong>
                    </div>

                    <div className="profile-detail">
                        <span>Email</span>
                        <strong>{profile.email}</strong>
                    </div>
                </div>
            </section>

            <section className="profile-edit">
                <div className="profile-section-heading">
                    <div>
                        <h2>Cập nhật hồ sơ</h2>
                        <p>
                            Thay đổi thông tin cá nhân của bạn.
                        </p>
                    </div>
                </div>

                <form
                    className="profile-form"
                    onSubmit={handleUpdateProfile}
                >
                    <label>
                        Họ và tên
                        <input
                            type="text"
                            value={fullName}
                            onChange={(event) =>
                                setFullName(event.target.value)
                            }
                        />
                    </label>

                    <label>
                        Số điện thoại
                        <input
                            type="tel"
                            value={phone}
                            onChange={(event) =>
                                setPhone(event.target.value)
                            }
                        />
                    </label>

                    <label>
                        Ngày sinh
                        <input
                            type="date"
                            value={dateOfBirth}
                            onChange={(event) =>
                                setDateOfBirth(event.target.value)
                            }
                        />
                    </label>

                    <label className="profile-form__full">
                        URL ảnh đại diện
                        <input
                            type="url"
                            value={avatarUrl}
                            onChange={(event) =>
                                setAvatarUrl(event.target.value)
                            }
                        />
                    </label>

                    <div className="profile-form__actions">
                        <button type="submit" disabled={saving}>
                            {saving
                                ? "Đang lưu..."
                                : "Lưu thay đổi"}
                        </button>
                    </div>

                    {message && (
                        <p role="status">{message}</p>
                    )}

                    {error && (
                        <p role="alert" className="error-state">
                            {error}
                        </p>
                    )}
                </form>
            </section>

            <section className="profile-edit">
                <div className="profile-section-heading">
                    <div>
                        <h2>Sổ địa chỉ</h2>
                        <p>Quản lý các địa chỉ giao hàng đã lưu, dùng để chọn nhanh khi thanh toán.</p>
                    </div>
                </div>

                <AddressBook
                    mode="manage"
                    addresses={addresses}
                    isLoading={isLoadingAddresses}
                    error={addressesError}
                    onAddressesChange={refetchAddresses}
                />
            </section>
        </main>
    );
}