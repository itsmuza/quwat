# Saved Products API

Updated: **2026-10-12**, Asia/Seoul. Backend implemented; frontend remains separate.

Saved — mahsulotni keyinroq ko‘rish uchun shaxsiy ro‘yxatga saqlash. Like/favorites va xarid savatidan mustaqil; qoldiq, view/like soni va reyting o‘zgarmaydi.

## Postman sozlamasi

- Method: `POST`
- URL: `http://localhost:3007/graphql`
- Header: `Authorization: Bearer <CLIENT_ACCESS_TOKEN>`
- Postman GraphQL body’da Query va Variables maydonlarini alohida to‘ldiring.

Faqat bazadagi joriy roli CLIENT va statusi ACTIVE bo‘lgan member ushbu uch API’dan foydalanadi. ADMIN/AGENT ruxsati yo‘q. `memberId` input orqali yuborilmaydi.

## Mahsulotni saqlash

Query:

```graphql
mutation SaveProduct($productId: String!) {
  saveProduct(productId: $productId)
}
```

Variables (ID’ni mavjud ACTIVE mahsulot ID’siga almashtiring):

```json
{
  "productId": "507f1f77bcf86cd799439011"
}
```

Natija: `saveProduct: true`. Nol qoldiqli ACTIVE mahsulot ham saqlanadi. Takroriy saqlash bitta yozuvni saqlaydi va birinchi saqlangan vaqtni o‘zgartirmaydi. Yangi saqlashda DRAFT/ARCHIVED yoki mavjud bo‘lmagan mahsulot rad etiladi.

## Saqlangan ro‘yxatdan olib tashlash

Query:

```graphql
mutation UnsaveProduct($productId: String!) {
  unsaveProduct(productId: $productId)
}
```

Variables:

```json
{
  "productId": "507f1f77bcf86cd799439011"
}
```

Natija: `unsaveProduct: true`. Oldindan saqlanmagan, arxivlangan yoki fizik o‘chirilgan mahsulot uchun ham muvaffaqiyatli bo‘ladi. Faqat joriy clientning yozuvi olib tashlanadi. Noto‘g‘ri ID formati ikkala mutation’da validatsiya xatosi beradi.

## Saved ro‘yxatini olish

Query:

```graphql
query GetSavedProducts($input: OrdinaryInquiry!) {
  getSavedProducts(input: $input) {
    list {
      _id
      productName
      productType
      productStatus
      productUnit
      productPrice
      productImages
      productQuantity
      productReservedQuantity
      meSaved
    }
    metaCounter {
      total
    }
  }
}
```

Variables:

```json
{
  "input": {
    "page": 1,
    "limit": 10
  }
}
```

- `page` kamida 1; `limit` 1–100.
- Oxirgi saqlangan birinchi keladi; teng vaqtda saved yozuv `_id`si kamayish tartibida.
- ACTIVE va ARCHIVED ko‘rinadi. ARCHIVED kartaga frontend “Sotuvda yo‘q” belgisini qo‘yadi; ochiq `getProduct` API faqat ACTIVE uchun ishlaydi.
- DRAFT va fizik o‘chirilgan kartalar ro‘yxat/umumiy sondan chiqariladi. Status o‘zgarganda saved bog‘lanishi saqlanadi; qayta ACTIVE bo‘lsa yana ko‘rinadi.
- Saved’ni o‘qish view hisoblagichini oshirmaydi.

## Katalogda saqlanganlikni ko‘rish

Query:

```graphql
query GetProducts($input: ProductsInquiry!) {
  getProducts(input: $input) {
    list {
      _id
      productName
      meSaved
    }
  }
}
```

Variables:

```json
{
  "input": {
    "page": 1,
    "limit": 10,
    "search": {}
  }
}
```

`meSaved` Product output’ida hisoblanadigan Boolean maydon. Token bilan joriy client uchun true/false; anonymous yoki boshqa rollar uchun false. Mahsulot hujjatiga yozilmaydi va create/update input’larida mavjud emas.

## Saqlash tuzilmasi va tekshiruv chegarasi

MongoDB `saved_products`: `_id`, `memberId`, `productId`, `createdAt`, `updatedAt`. Unique index `{ memberId: 1, productId: 1 }`; list index `{ memberId: 1, createdAt: -1, _id: -1 }`. Save unique index tayyor bo‘lishini kutadi. Like/favorites ma’lumotlari import qilinmaydi.

Testlar Nest GraphQL execution, real JWT, uzilgan Mongoose modellar va storage mock’lari orqali ishlaydi. Deployment bazasiga ulanilmagan; MongoDB serveridagi aggregation va unique-index concurrency tekshiruvi alohida test bazasida bajarilishi kerak.
