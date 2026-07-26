# Sơ đồ Mermaid cho báo cáo đợt 2

> File này chỉ chứa các **sơ đồ** dùng để cập nhật vào file Word báo cáo (`LamDuyQuy_C10_BCDK2.docx`).
> Nội dung chữ (phân tích, thiết kế, tiến độ, kế hoạch...) nằm trong file Word — đã được cập nhật
> trực tiếp vào các mục tương ứng của đợt 1 theo code hiện tại, không tách riêng thành chương "đợt 2"
> nói lại từ đầu.
>
> Cách lấy ảnh: copy đoạn mã trong khối ` ```mermaid ` của từng sơ đồ, dán vào
> **https://mermaid.live**, bấm **Actions → Download PNG**, rồi dán vào đúng vị trí có ghi
> `[CHỖ DÁN ẢNH — Sơ đồ N ...]` trong file Word. Sau khi commit file này lên GitHub, GitHub cũng tự
> render trực tiếp khi xem trên web (dùng để xem trước, kiểm tra sơ đồ có đúng không).

---

## Sơ đồ 1 — Use Case: Khách (chưa đăng nhập)

Không đổi so với đợt 1 — nhóm chức năng này chưa có thay đổi.

```mermaid
flowchart LR
    Khach(["Khách"])
    subgraph HeThong["Hệ thống"]
        UC1(("Xem danh sách sản phẩm"))
        UC2(("Xem chi tiết sản phẩm"))
        UC3(("Đăng ký tài khoản"))
        UC4(("Đăng nhập"))
        UC5(("Yêu cầu đặt lại mật khẩu"))
    end
    Khach --> UC1
    Khach --> UC2
    Khach --> UC3
    Khach --> UC4
    Khach --> UC5
```

## Sơ đồ 2 — Use Case: Khách hàng đã đăng nhập (cập nhật theo code hiện tại)

Bổ sung so với đợt 1: phân tích khuôn mặt, lịch sử phân tích, nhận gợi ý, thử kính ảo, giỏ hàng,
đặt hàng và theo dõi đơn hàng.

```mermaid
flowchart LR
    NguoiDung(["Khách hàng đã đăng nhập"])
    subgraph HeThong2["Hệ thống"]
        UC6(("Xem hồ sơ cá nhân"))
        UC7(("Cập nhật hồ sơ"))
        UC8(("Đổi mật khẩu"))
        UC9(("Xem sản phẩm"))
        UC10(("Tải ảnh & phân tích dáng khuôn mặt"))
        UC11(("Xem / xóa lịch sử phân tích"))
        UC12(("Nhận gợi ý mẫu kính theo dáng mặt"))
        UC13(("Thử kính ảo - webcam / ảnh tĩnh"))
        UC14(("Quản lý giỏ hàng"))
        UC15(("Đặt hàng & theo dõi đơn hàng"))
    end
    NguoiDung --> UC6
    NguoiDung --> UC7
    NguoiDung --> UC8
    NguoiDung --> UC9
    NguoiDung --> UC10
    NguoiDung --> UC11
    NguoiDung --> UC12
    NguoiDung --> UC13
    NguoiDung --> UC14
    NguoiDung --> UC15
```

## Sơ đồ 3 — Use Case: Quản trị viên (cập nhật theo code hiện tại)

Bổ sung so với đợt 1: quản lý vai trò & phân quyền (RBAC), quản lý người dùng, cập nhật trạng thái
đơn hàng.

```mermaid
flowchart LR
    QuanTri(["Quản trị viên"])
    subgraph HeThong3["Hệ thống"]
        UC16(("Đăng nhập trang quản trị"))
        UC17(("Quản lý dữ liệu danh mục"))
        UC18(("Quản lý thương hiệu"))
        UC19(("Quản lý sản phẩm, biến thể, hình ảnh"))
        UC20(("Quản lý vai trò & phân quyền"))
        UC21(("Quản lý người dùng"))
        UC22(("Cập nhật trạng thái đơn hàng"))
    end
    QuanTri --> UC16
    QuanTri --> UC17
    QuanTri --> UC18
    QuanTri --> UC19
    QuanTri --> UC20
    QuanTri --> UC21
    QuanTri --> UC22
```

## Sơ đồ 4 — Kiến trúc Microservices tổng thể (cập nhật, trạng thái hiện tại)

Thay cho sơ đồ đợt 1 (khi đó chỉ có API Gateway/User/Product Service là thật) — sơ đồ này phản ánh
đúng trạng thái hiện tại: Order, Face Processing, Recommendation Service đã hoạt động thật; Payment
Service vẫn chưa triển khai.

```mermaid
flowchart TB
    Browser["Trình duyệt - Web Next.js"]

    Browser --> Gateway["API Gateway - NestJS"]

    Gateway --> UserSvc["User Service - Spring Boot (+ RBAC)"]
    Gateway --> ProductSvc["Product Service - NestJS"]
    Gateway --> FaceSvc["Face Processing Service - FastAPI"]
    Gateway --> RecoSvc["Recommendation Service - FastAPI"]
    Gateway --> OrderSvc["Order Service - Spring Boot"]

    RecoSvc --> ProductSvc
    OrderSvc --> ProductSvc
    OrderSvc -.chua trien khai.-> PaymentSvc["Payment Service - chua trien khai"]

    UserSvc --> AuthDB[("auth_db")]
    ProductSvc --> ProductDB[("product_db")]
    ProductSvc --> MinIOProduct[("MinIO - anh san pham")]
    FaceSvc --> FaceDB[("face_processing_db")]
    FaceSvc --> MinIOFace[("MinIO - anh khuon mat")]
    OrderSvc --> OrderDB[("order_db")]
    OrderSvc --> Redis[("Redis - gio hang")]

    ProductSvc -.POC.-> RabbitMQ{{"RabbitMQ - event bus (POC)"}}
```

## Sơ đồ 5 — API Gateway (cập nhật)

Bổ sung so với đợt 1: Gateway hiện proxy thêm các nhóm route face-analysis, recommendations, cart,
orders, RBAC — bảo vệ bằng guard theo quyền cụ thể (permission-based), không chỉ theo vai trò cố
định như trước.

```mermaid
flowchart LR
    Client["Trình duyệt (Web)"] --> GW["API Gateway"]
    GW --> Route["Routing - định tuyến request"]
    GW --> Auth["Authentication - xác thực JWT"]
    GW --> AuthZ["Authorization - kiểm tra quyền theo permission"]
    GW --> CORS["CORS tập trung"]
    GW --> Rate["Rate limiting"]
    GW --> UserSvc["User Service (+ RBAC)"]
    GW --> ProductSvc["Product Service"]
    GW --> FaceSvc["Face Processing Service"]
    GW --> RecoSvc["Recommendation Service"]
    GW --> OrderSvc["Order Service"]
```

## Sơ đồ 6 — ERD User Service (cập nhật, có RBAC)

Thay cho sơ đồ đợt 1 (chỉ có User/Profile/PasswordResetToken) — bổ sung Role và Permission, theo
mô hình giống AWS IAM: một User có nhiều Role, một Role có nhiều Permission. **Dùng lại đúng ảnh
này ở cả 2 vị trí trong Word: mục 2.5.1 và mục 3.3.2.**

```mermaid
erDiagram
    USERS ||--o| PROFILES : has
    USERS ||--o{ PASSWORD_RESET_TOKENS : requests
    USERS }o--o{ ROLES : "gan qua USER_ROLES"
    ROLES }o--o{ PERMISSIONS : "gan qua ROLE_PERMISSIONS"

    USERS {
        uuid id PK
        string email UK
        string username UK
        string passwordHash
        string status
    }
    PROFILES {
        uuid id PK
        uuid userId FK
        string firstName
        string lastName
        string phone
        string address
    }
    PASSWORD_RESET_TOKENS {
        uuid id PK
        uuid userId FK
        string tokenHash
        datetime expiresAt
    }
    ROLES {
        uuid id PK
        string name UK
        string description
    }
    PERMISSIONS {
        uuid id PK
        string code UK
        string name
    }
```

## Sơ đồ 7 — ERD Product Service

Không đổi so với đợt 1 — cấu trúc dữ liệu Product Service chưa thay đổi. **Dùng lại đúng ảnh này ở
cả 2 vị trí trong Word: mục 2.5.2 và mục 3.4.2.**

```mermaid
erDiagram
    PRODUCTS ||--o{ PRODUCT_VARIANTS : has
    PRODUCT_VARIANTS ||--o{ PRODUCT_IMAGES : has
    PRODUCTS }o--|| BRANDS : belongs_to
    PRODUCTS }o--|| CATEGORIES : belongs_to
    PRODUCTS ||--o{ RATINGS : rated
    PRODUCTS ||--o{ PRODUCT_FACE_SHAPES : recommended_for
    PRODUCTS }o--o{ TAGS : tagged
    PRODUCT_VARIANTS ||--o| INVENTORY : tracked_by

    PRODUCTS {
        uuid id PK
        uuid brandId FK
        uuid categoryId FK
        string sku
        string name
        string frameShape
        string genderTarget
        string status
        decimal price
    }
    PRODUCT_VARIANTS {
        uuid id PK
        uuid productId FK
        string color
        string size
        decimal price
        int stock
    }
    PRODUCT_IMAGES {
        uuid id PK
        uuid variantId FK
        string imageUrl
        boolean isThumbnail
    }
    BRANDS {
        uuid id PK
        string name
    }
    CATEGORIES {
        uuid id PK
        uuid parentId FK
        string name
    }
    TAGS {
        uuid id PK
        string name
    }
    RATINGS {
        uuid id PK
        uuid productId FK
        uuid userId
        int rating
        string review
    }
    INVENTORY {
        uuid id PK
        uuid variantId FK
        int quantity
        int reservedQuantity
    }
    PRODUCT_FACE_SHAPES {
        uuid productId FK
        string faceShape
    }
```

## Sơ đồ 8 — ERD Face Processing Service (mới, đợt 2)

```mermaid
erDiagram
    FACE_ANALYSES {
        uuid id PK
        uuid user_id
        string s3_key
        string faceShape
        json measurements
        float confidence
        datetime createdAt
    }
```

## Sơ đồ 9 — ERD Order Service (mới, đợt 2)

Giỏ hàng không có bảng riêng — lưu trực tiếp trong Redis, không thuộc `order_db`.

```mermaid
erDiagram
    ORDERS ||--o{ ORDER_ITEMS : contains
    ORDERS ||--o{ ORDER_STATUS_HISTORIES : tracks

    ORDERS {
        uuid id PK
        string orderCode UK
        uuid user_id
        decimal totalAmount
        string status
        string paymentMethod
        string paymentStatus
        string receiverName
        string shippingAddress
        datetime createdAt
    }
    ORDER_ITEMS {
        uuid id PK
        uuid order_id FK
        uuid productId
        uuid variantId
        int quantity
        decimal unitPrice
        decimal subtotal
    }
    ORDER_STATUS_HISTORIES {
        uuid id PK
        uuid order_id FK
        string oldStatus
        string newStatus
        uuid changedBy
        string reason
        datetime createdAt
    }
```

## Sơ đồ 10 — Luồng xử lý end-to-end (sequence diagram)

```mermaid
sequenceDiagram
    actor U as "Nguoi dung"
    participant W as "Web (Next.js)"
    participant GW as "API Gateway"
    participant US as "User Service"
    participant FS as "Face Processing Service"
    participant RS as "Recommendation Service"
    participant PS as "Product Service"
    participant OS as "Order Service"
    participant PayS as "Payment Service (gia lap)"

    U->>W: Dang nhap
    W->>GW: POST /api/auth/login
    GW->>US: forward
    US-->>GW: JWT token
    GW-->>W: JWT token

    U->>W: Tai anh khuon mat
    W->>GW: POST /api/face-analysis/analyze
    GW->>FS: forward (multipart, X-User-Id)
    FS-->>GW: face_shape, do tin cay
    GW-->>W: ket qua phan tich

    W->>GW: POST /api/recommendations
    GW->>RS: forward (face_shape)
    RS->>PS: GET /products?faceShape=...
    PS-->>RS: danh sach san pham
    RS-->>GW: danh sach da xep hang
    GW-->>W: goi y kinh phu hop

    Note over W: Thu kinh ao (webcam hoac anh tinh)<br/>xu ly hoan toan phia client

    U->>W: Them vao gio hang
    W->>GW: POST /api/cart/items
    GW->>OS: forward
    OS-->>GW: gio hang cap nhat (Redis)

    U->>W: Dat hang
    W->>GW: POST /api/orders/checkout
    GW->>OS: forward
    OS->>PS: xac nhan lai gia san pham
    OS->>PayS: yeu cau thanh toan
    PayS-->>OS: ket qua thanh toan (gia lap - luon thanh cong)
    OS-->>GW: don hang da tao
    GW-->>W: xac nhan don hang
```

## Sơ đồ 11 — Vòng đời trạng thái đơn hàng

```mermaid
stateDiagram-v2
    [*] --> PENDING
    PENDING --> PROCESSING
    PROCESSING --> SHIPPED
    SHIPPED --> DELIVERED
    PENDING --> CANCELLED
    PROCESSING --> CANCELLED
    DELIVERED --> [*]
    CANCELLED --> [*]
```

## Sơ đồ 12 — Biểu đồ tiến độ (Gantt)

```mermaid
gantt
    title Tien do trien khai (theo cac merge/commit chinh)
    dateFormat  YYYY-MM-DD
    axisFormat  %d/%m
    section Tuan 1-2: Nen tang
    API Gateway + User Service + Product Service : done, w1, 2026-06-27, 2026-07-14
    section Tuan 3-4: Mua hang & khuon mat
    Face Processing Service (phan tich dang mat) : done, w2a, 2026-07-01, 2026-07-13
    RabbitMQ event bus (POC, ADR) : done, w2b, 2026-07-14, 2026-07-14
    Virtual Try-On (webcam) + Recommendation Service : done, w2c, 2026-07-15, 2026-07-16
    RBAC vai tro & quyen + Admin panel : done, w2d, 2026-07-15, 2026-07-21
    Order Service + Cart + Checkout : done, w2e, 2026-07-20, 2026-07-20
    Static photo try-on + lich su phan tich : done, w2f, 2026-07-21, 2026-07-25
    section Tuan 5-6: Con lai
    Payment Service (trien khai that) : active, w3a, 2026-07-26, 2026-08-02
    Stock reservation (giu cho ton kho) : w3b, 2026-08-02, 2026-08-06
    Kiem thu tich hop & hoan thien demo/bao cao : w3c, 2026-08-06, 2026-08-10
```
