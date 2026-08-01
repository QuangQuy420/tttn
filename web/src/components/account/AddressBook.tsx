"use client";

import { useState } from "react";
import { ApiError, createMyAddress, deleteMyAddress, updateMyAddress } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import type { Address } from "@/types/user";

const PHONE_PATTERN = /^(0|\+84)[0-9]{9,10}$/;

interface AddressFormValues {
  receiverName: string;
  receiverPhone: string;
  address: string;
  isDefault: boolean;
}

const BLANK_ADDRESS_FORM: AddressFormValues = {
  receiverName: "",
  receiverPhone: "",
  address: "",
  isDefault: false,
};

interface AddressFormErrors {
  receiverName?: string;
  receiverPhone?: string;
  address?: string;
}

function validateAddressForm(values: AddressFormValues): AddressFormErrors {
  const errors: AddressFormErrors = {};

  if (!values.receiverName.trim()) {
    errors.receiverName = "Tên người nhận không được để trống.";
  }

  if (!values.receiverPhone.trim()) {
    errors.receiverPhone = "Số điện thoại không được để trống.";
  } else if (!PHONE_PATTERN.test(values.receiverPhone.trim())) {
    errors.receiverPhone = "Số điện thoại không hợp lệ.";
  }

  if (!values.address.trim()) {
    errors.address = "Địa chỉ không được để trống.";
  }

  return errors;
}

// Shared field set for the "add new address" and "edit address" forms — same shape
// (receiverName/receiverPhone/address/isDefault), just a different idPrefix so <label htmlFor>
// ids stay unique across multiple forms rendered on the same page.
function AddressFormFields({
  idPrefix,
  values,
  errors,
  onChange,
}: {
  idPrefix: string;
  values: AddressFormValues;
  errors: AddressFormErrors;
  onChange: (values: AddressFormValues) => void;
}) {
  return (
    <>
      <label htmlFor={`${idPrefix}-receiver-name`}>
        Tên người nhận
        <input
          id={`${idPrefix}-receiver-name`}
          type="text"
          value={values.receiverName}
          onChange={(event) => onChange({ ...values, receiverName: event.target.value })}
          autoComplete="name"
        />
        {errors.receiverName && <span className="field-error">{errors.receiverName}</span>}
      </label>

      <label htmlFor={`${idPrefix}-receiver-phone`}>
        Số điện thoại
        <input
          id={`${idPrefix}-receiver-phone`}
          type="tel"
          value={values.receiverPhone}
          onChange={(event) => onChange({ ...values, receiverPhone: event.target.value })}
          autoComplete="tel"
        />
        {errors.receiverPhone && <span className="field-error">{errors.receiverPhone}</span>}
      </label>

      <label htmlFor={`${idPrefix}-line`}>
        Địa chỉ giao hàng
        <input
          id={`${idPrefix}-line`}
          type="text"
          value={values.address}
          onChange={(event) => onChange({ ...values, address: event.target.value })}
          autoComplete="street-address"
        />
        {errors.address && <span className="field-error">{errors.address}</span>}
      </label>

      <label className="address-picker__default-check">
        <input
          type="checkbox"
          checked={values.isDefault}
          onChange={(event) => onChange({ ...values, isDefault: event.target.checked })}
        />
        Đặt làm địa chỉ mặc định
      </label>
    </>
  );
}

interface AddressBookProps {
  addresses: Address[];
  isLoading: boolean;
  error: string | null;
  onAddressesChange: () => Promise<void>;
  // "picker": radio selection for checkout (CheckoutPage owns the selected id and submits it).
  // "manage": plain list with edit/delete, no selection (profile's address book).
  mode: "picker" | "manage";
  selectedAddressId?: string | null;
  onSelectAddress?: (address: Address) => void;
}

// Add/edit/delete UI for a user's saved shipping addresses (user-service's /addresses). Shared
// between CheckoutPage (pick one to ship to) and the profile page (manage the whole list) so the
// form fields, validation and save/delete plumbing exist in exactly one place.
export function AddressBook({
  addresses,
  isLoading,
  error,
  onAddressesChange,
  mode,
  selectedAddressId = null,
  onSelectAddress,
}: AddressBookProps) {
  const isPicker = mode === "picker";

  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<AddressFormValues>(BLANK_ADDRESS_FORM);
  const [addressFormErrors, setAddressFormErrors] = useState<AddressFormErrors>({});
  const [isSavingAddressForm, setIsSavingAddressForm] = useState(false);
  const [addressFormError, setAddressFormError] = useState<string | null>(null);
  const [deletingAddressId, setDeletingAddressId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openAddForm() {
    setEditingAddressId(null);
    setIsAddingAddress(true);
    setAddressForm(BLANK_ADDRESS_FORM);
    setAddressFormErrors({});
    setAddressFormError(null);
  }

  function openEditForm(address: Address) {
    setIsAddingAddress(false);
    setEditingAddressId(address.id);
    setAddressForm({
      receiverName: address.receiverName,
      receiverPhone: address.receiverPhone,
      address: address.address,
      isDefault: address.isDefault,
    });
    setAddressFormErrors({});
    setAddressFormError(null);
  }

  function closeAddressForm() {
    setIsAddingAddress(false);
    setEditingAddressId(null);
    setAddressFormErrors({});
    setAddressFormError(null);
  }

  async function handleSaveAddressForm() {
    const errors = validateAddressForm(addressForm);
    setAddressFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const token = getAccessToken();
    if (!token) {
      setAddressFormError("Bạn cần đăng nhập để lưu địa chỉ.");
      return;
    }

    const payload = {
      receiverName: addressForm.receiverName.trim(),
      receiverPhone: addressForm.receiverPhone.trim(),
      address: addressForm.address.trim(),
      isDefault: addressForm.isDefault,
    };

    setIsSavingAddressForm(true);
    setAddressFormError(null);
    try {
      const response = editingAddressId
        ? await updateMyAddress(token, editingAddressId, payload)
        : await createMyAddress(token, payload);
      await onAddressesChange();
      onSelectAddress?.(response.data);
      closeAddressForm();
    } catch (err) {
      setAddressFormError(err instanceof ApiError ? err.message : "Không thể lưu địa chỉ.");
    } finally {
      setIsSavingAddressForm(false);
    }
  }

  async function handleDeleteAddress(address: Address) {
    if (!window.confirm(`Xóa địa chỉ của ${address.receiverName}? Hành động này không thể hoàn tác.`)) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setDeleteError("Bạn cần đăng nhập để xóa địa chỉ.");
      return;
    }

    setDeletingAddressId(address.id);
    setDeleteError(null);
    try {
      await deleteMyAddress(token, address.id);
      await onAddressesChange();
      if (editingAddressId === address.id) closeAddressForm();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Không thể xóa địa chỉ.");
    } finally {
      setDeletingAddressId(null);
    }
  }

  if (isLoading) {
    return <p className="address-picker__loading">Đang tải địa chỉ...</p>;
  }

  const isAddressFormOpen = isAddingAddress || editingAddressId !== null;
  const showAddForm = isAddingAddress || addresses.length === 0;

  return (
    <div className="address-picker">
      {error && <p className="field-error">{error}</p>}
      {deleteError && (
        <p role="alert" className="error-state">
          {deleteError}
        </p>
      )}

      {addresses.length > 0 && (
        <div
          className="address-picker__list"
          role={isPicker ? "radiogroup" : undefined}
          aria-label={isPicker ? "Chọn địa chỉ giao hàng" : undefined}
        >
          {addresses.map((address) =>
            editingAddressId === address.id ? (
              <div key={address.id} className="address-picker__add-form">
                <AddressFormFields
                  idPrefix={`edit-address-${address.id}`}
                  values={addressForm}
                  errors={addressFormErrors}
                  onChange={setAddressForm}
                />

                {addressFormError && (
                  <p role="alert" className="error-state">
                    {addressFormError}
                  </p>
                )}

                <div className="address-picker__add-form-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--small"
                    onClick={handleSaveAddressForm}
                    disabled={isSavingAddressForm}
                  >
                    {isSavingAddressForm ? "Đang lưu..." : "Lưu"}
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline btn--small"
                    onClick={closeAddressForm}
                    disabled={isSavingAddressForm}
                  >
                    Hủy
                  </button>
                </div>
              </div>
            ) : isPicker ? (
              <label
                key={address.id}
                className={
                  "address-picker__option" +
                  (!isAddressFormOpen && selectedAddressId === address.id
                    ? " address-picker__option--selected"
                    : "")
                }
              >
                <input
                  type="radio"
                  name="shipping-address"
                  checked={!isAddressFormOpen && selectedAddressId === address.id}
                  onChange={() => {
                    onSelectAddress?.(address);
                    closeAddressForm();
                  }}
                />
                <span className="address-picker__option-body">
                  <span className="address-picker__option-name">
                    {address.receiverName} · {address.receiverPhone}
                    {address.isDefault && <span className="address-picker__badge">Mặc định</span>}
                  </span>
                  <span className="address-picker__option-address">{address.address}</span>
                </span>
                <button
                  type="button"
                  className="address-picker__edit-btn"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openEditForm(address);
                  }}
                >
                  Sửa
                </button>
              </label>
            ) : (
              <div key={address.id} className="address-picker__option address-picker__option--static">
                <span className="address-picker__option-body">
                  <span className="address-picker__option-name">
                    {address.receiverName} · {address.receiverPhone}
                    {address.isDefault && <span className="address-picker__badge">Mặc định</span>}
                  </span>
                  <span className="address-picker__option-address">{address.address}</span>
                </span>
                <div className="address-picker__option-actions">
                  <button type="button" className="address-picker__edit-btn" onClick={() => openEditForm(address)}>
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="address-picker__edit-btn address-picker__edit-btn--danger"
                    onClick={() => handleDeleteAddress(address)}
                    disabled={deletingAddressId === address.id}
                  >
                    {deletingAddressId === address.id ? "Đang xóa..." : "Xóa"}
                  </button>
                </div>
              </div>
            ),
          )}

          {isPicker && (
            <label
              className={
                "address-picker__option" + (isAddingAddress ? " address-picker__option--selected" : "")
              }
            >
              <input type="radio" name="shipping-address" checked={isAddingAddress} onChange={openAddForm} />
              <span className="address-picker__option-body">
                <span className="address-picker__option-name">Thêm địa chỉ mới</span>
              </span>
            </label>
          )}
        </div>
      )}

      {!isPicker && !showAddForm && (
        <button
          type="button"
          className="btn btn--outline btn--small address-picker__add-trigger"
          onClick={openAddForm}
        >
          Thêm địa chỉ mới
        </button>
      )}

      {showAddForm && (
        <div className="address-picker__add-form">
          <AddressFormFields
            idPrefix="new-address"
            values={addressForm}
            errors={addressFormErrors}
            onChange={setAddressForm}
          />

          {addressFormError && (
            <p role="alert" className="error-state">
              {addressFormError}
            </p>
          )}

          <div className="address-picker__add-form-actions">
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={handleSaveAddressForm}
              disabled={isSavingAddressForm}
            >
              {isSavingAddressForm ? "Đang lưu..." : "Lưu địa chỉ"}
            </button>
            {addresses.length > 0 && (
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={closeAddressForm}
                disabled={isSavingAddressForm}
              >
                Hủy
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
