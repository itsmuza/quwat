# Attendance API

Updated: **2026-10-16**, Asia/Seoul. Backend and frontend request/review/history are implemented; existing-agent deployment initialization remains separate.

## Qoidalar

- Kun serverda **Asia/Tashkent** bo‘yicha olinadi. Agent sana yoki boshqa agent ID’sini yubormaydi.
- `ABSENT`: kun uchun so‘rov yo‘q; hisobotda hisoblanadi, bazaga yozilmaydi.
- `PENDING`: so‘rov yuborilgan, tasdiq kutilmoqda.
- `APPROVED`: admin tasdiqlagan; ishga kelgan hisoblanadi.
- `REJECTED`: rad etilgan; qayta yuborib ochish yoki qarorni almashtirish mumkin emas.
- Har agent/sana uchun bitta yozuv. Bir xil so‘rov/qarorni takrorlash dastlabki vaqtni o‘zgartirmaydi.
- Barcha kalendar kunlari attendanceStartDate’dan bugungacha hisoblanadi; ish jadvali/kechikish/maosh/GPS yo‘q.
- So‘rov adminning navbar/admin-toolbar qo‘ng‘irog‘ida va PENDING ro‘yxatida ko‘rinadi. Qo‘ng‘iroq faol sahifada har5 soniyada va sahifaga qaytilganda yangilanadi; yangi WebSocket push qo‘shilmagan.

## Frontend oqimi

- AGENT: Shaxsiy bo‘lim → Davomat (`/mypage?category=attendance`) → joriy oy kalendari. Oy tanlash orqali o‘tgan tarix ochiladi; sana/status filtrlari va kunlar paginationi yo‘q. **Ishga keldim** faqat serverdagi bugun uchun so‘rov yuboradi, ko‘rilayotgan oy uchun emas.
- ADMIN: Davomat (`/_admin/attendance`) tepasida agentlarning rasm va ismlari bilan gorizontal qator, pastida tanlangan agent kalendari va barcha PENDING so‘rovlari bir sahifada ko‘rinadi. Birinchi agent avtomatik tanlanadi; desktopda 6 ta, planshetda 4 ta, mobilda 2 ta agent sig‘adi, qolganlari gorizontal scroll orqali ochiladi. Mavjud 20-agent paginationi saqlangan. Qaror yuborish davomida agent almashtirish bloklanadi. Sariq kun yoki **Ko‘rib chiqish** orqali tasdiqlash/rad etish dialogi ochiladi. Navbat tanlangan oydan mustaqil; eski PENDING so‘rovlar ham ko‘rinadi.
- ADMIN bildirishnomalari: qo‘ng‘iroq o‘ngdan ochiladigan panelni ochadi; unda barcha agentlarning faqat PENDING so‘rovlari, jumladan eski sanalar ham bor. Agent nomi/sanasi/so‘rov vaqti ko‘rsatiladi, tasdiqlash yoki rad etish panelning o‘zida dialog orqali bajariladi. UI paginationi yo‘q; API100-limit batchlari avtomatik yuklanadi. Qarordan so‘ng yozuv bildirishnomalardan chiqadi, davomat tarixi saqlanadi. API va ruxsatlar o‘zgarmagan; alohida notification collection kerak emas.
- APPROVED yashil **Kelgan**, ABSENT/REJECTED qizil, PENDING sariq. Kelajak va enrollment’dan oldingi kunlar kulrang, kelmagan deb hisoblanmaydi. Har oy to‘liq sanalar bilan chiziladi; statuslar faqat backend qaytargan kunlarga beriladi.
- Agent bugungi holati, admin tanlangan agent kalendari va PENDING navbati 30 soniyada poll qilinadi. Qarordan so‘ng tegishli kalendar/navbat va admin bildirishnomalari yangilanadi. Yakuniy qarorni o‘zgartirish mumkin emas. Bildirishnomalar uchun yuqoridagi5-soniyalik polling ishlatiladi.
- Mavjud-agent setup qoidalari saqlangan; bu o‘zgarishda setup skripti bajarilmadi.

## Postman

`POST http://localhost:3007/graphql`, **Body → GraphQL**. Query va Variables’ni alohida maydonlarga joylashtiring. Header:

```text
Authorization: Bearer <AGENT_ACCESS_TOKEN>
```

Admin API’lari uchun tokenni `<ADMIN_ACCESS_TOKEN>`ga almashtiring. Faqat joriy bazadagi ACTIVE member o‘z roliga mos API’dan foydalanadi; CLIENT/anonymous ruxsati yo‘q.

## Agent: bugungi davomat so‘rovi

Query:

```graphql
mutation RequestAttendance {
  requestAttendance {
    _id
    memberId
    attendanceDate
    attendanceStatus
    reviewedAt
    createdAt
    updatedAt
  }
}
```

Variables:

```json
{}
```

Yangi so‘rov PENDING bo‘ladi. Takrorlash mavjud yozuvni, shu jumladan yakuniy qarorni qaytaradi. Eski sanaga so‘rov yaratib bo‘lmaydi. Boshlanish sanasi sozlanmagan bo‘lsa `Attendance setup required` xatosi beriladi.

## Agent: o‘z kalendar tarixi

Query:

```graphql
query GetMyAttendances($input: MyAttendancesInquiry!) {
  getMyAttendances(input: $input) {
    list {
      memberId
      attendanceDate
      attendanceStatus
      attendanceId
      requestedAt
      reviewedAt
    }
    metaCounter { total }
  }
}
```

Variables:

```json
{
  "input": {
    "page": 1,
    "limit": 31,
    "fromDate": "2026-10-01",
    "toDate": "2026-10-31"
  }
}
```

Sana chegaralarini tashlab yuborsangiz, boshlanish sanasidan bugungacha olinadi. Oraliq enrollment/today bilan cheklanadi: undan oldingi yoki kelajak kunlar ko‘rinmaydi. So‘rovsiz kunlarda `attendanceStatus: ABSENT`, attendanceId/requestedAt/reviewedAt null. Faqat kelmagan kunlar uchun input’ga `"attendanceStatus": "ABSENT"` qo‘shing. Agent boshqa member ID’sini yubora olmaydi.

## Admin: so‘rovlar tarixi va PENDING navbat

Query:

```graphql
query GetAllAttendancesByAdmin($input: AdminAttendancesInquiry!) {
  getAllAttendancesByAdmin(input: $input) {
    list {
      _id
      memberId
      attendanceDate
      attendanceStatus
      reviewedAt
      createdAt
      updatedAt
      memberData { _id memberNick memberFullName }
    }
    metaCounter { total }
  }
}
```

Variables:

```json
{
  "input": {
    "page": 1,
    "limit": 20,
    "attendanceStatus": "PENDING"
  }
}
```

Status filtrini olib tashlasangiz barcha haqiqiy so‘rovlar qaytadi. Ixtiyoriy memberId/fromDate/toDate filtrlari bor. Bu API ABSENT yaratmaydi yoki qaytarmaydi; ABSENT status filtri rad etiladi. Agent bloklangan/roli o‘zgargan bo‘lsa ham uning haqiqiy yozuvlari qoladi. Fizik o‘chirilgan member uchun memberData null bo‘ladi; so‘rov ro‘yxatdan yo‘qolmaydi.

## Admin: tasdiqlash yoki rad etish

Query:

```graphql
mutation ReviewAttendance($input: ReviewAttendanceInput!) {
  reviewAttendance(input: $input) {
    _id
    memberId
    attendanceDate
    attendanceStatus
    reviewedAt
    updatedAt
    memberData { _id memberNick memberFullName }
  }
}
```

Variables (`_id`ga requestAttendance qaytargan so‘rov ID’sini yozing):

```json
{
  "input": {
    "_id": "507f1f77bcf86cd799439011",
    "attendanceStatus": "APPROVED"
  }
}
```

Rad etish uchun `REJECTED` yoziladi. PENDING/ABSENT qaror sifatida qabul qilinmaydi. Admin eski kundagi PENDING so‘rovga ham qaror beradi. Bir xil qaror takrorlansa mavjud natija qaytadi; boshqa yakuniy qarorga almashtirish Conflict beradi. `reviewedAt` serverdan olinadi.

## Admin: tanlangan agent kalendari

```graphql
query GetAgentAttendancesByAdmin($input: AgentAttendancesInquiry!) {
  getAgentAttendancesByAdmin(input: $input) {
    list { memberId attendanceDate attendanceStatus attendanceId requestedAt reviewedAt }
    metaCounter { total }
  }
}
```

```json
{
  "input": {
    "memberId": "507f1f77bcf86cd799439011",
    "page": 1,
    "limit": 31,
    "fromDate": "2026-10-01",
    "toDate": "2026-10-31"
  }
}
```

Faqat ACTIVE ADMIN foydalanadi. memberId majburiy Mongo ID, tanlangan member AGENT bo‘lishi kerak; BLOCK/DELETE holatidagi agentning tarixini admin o‘qishi mumkin. Agent yo‘q bo‘lsa NotFound, startDate sozlanmagan bo‘lsa setup-required xatosi. MyAttendancesInquiry sana/status/pagination validatsiyasi qo‘llanadi. O‘z kalendaridagi kabi enrollment/today chegaralari, virtual ABSENT va tartib saqlanadi; password/startDate yoki boshqa profil ma’lumotlari qaytmaydi. Hech qanday yozuv yaratilmaydi. Frontend kelajak/pre-start kunlarni ushbu chegaralardan tashqarida kulrang qilib chizadi. Agent o‘zining getMyAttendances so‘rovida boshqa memberId yubora olmaydi.

## Admin: tanlangan kunning davomat hisoboti

Query:

```graphql
query GetDailyAttendancesByAdmin($input: DailyAttendancesInquiry!) {
  getDailyAttendancesByAdmin(input: $input) {
    list {
      memberId
      attendanceDate
      attendanceStatus
      attendanceId
      requestedAt
      reviewedAt
      memberData { _id memberNick memberFullName }
    }
    metaCounter { total }
  }
}
```

Variables:

```json
{
  "input": {
    "page": 1,
    "limit": 20,
    "date": "2026-10-12"
  }
}
```

`date` yuborilmasa Tashkent bo‘yicha bugun olinadi. Joriy AGENT roli va ACTIVE/BLOCK statusidagi memberlar olinadi; DELETE va tanlangan kunda hisobi hali boshlanmagan agentlar chiqariladi. So‘rov yo‘q bo‘lsa ABSENT. Ixtiyoriy attendanceStatus filtri ABSENT’ni ham qabul qiladi. Kelajak sanaga bo‘sh natija qaytadi. Ishga qabul/bo‘shash tarixiy davrlari qayta tiklanmaydi: bu joriy agentlar ro‘yxati asosidagi hisobot.

## Pagination va formatlar

- page kamida 1, limit 1–100; barcha list API’larida majburiy.
- Filtrlar total va pagination’dan oldin qo‘llanadi. Bo‘sh natija `list: [], metaCounter: []`.
- Shaxsiy va so‘rovlar tarixi eng yangi kun birinchi; haqiqiy so‘rovlarda teng sanalar _id kamayish tartibida.
- Admin kunlik ro‘yxati memberNick, keyin memberId o‘sish tartibida.
- Sana `YYYY-MM-DD`, haqiqiy kalendar sanasi bo‘lishi kerak. fromDate > toDate rad etiladi. Vaqt maydonlari UTC DateTime.
- Member ma’lumotlari faqat _id/memberNick/memberFullName; parol/token/telefon qaytmaydi.

## Mavjud agentlarni boshlang‘ich sozlash — alohida deployment amali

2026-10-14 (Asia/Seoul) kuni foydalanuvchining lokal backend tanlagan **development Quwat bazasida** skript bir marta bajarildi: boshlanish sanasi yo‘q 1 ta agent 2026-10-13 (Asia/Tashkent kuni) bilan sozlandi. Davomat so‘rovi yoki tasdiq yaratilmagan. Boshqa, jumladan production bazalarda setup bajarilmagan.

Funksiyani boshqa bazada ishga tushirish kuni operator `ATTENDANCE_SETUP_MONGO_URI`ga kerakli Quwat bazasining URI’sini alohida beradi, keyin loyiha papkasidan bajaradi:

```bash
node scripts/initialize-attendance.cjs
```

`.env` avtomatik o‘qilmaydi va URI logga yozilmaydi. Skript AGENT roli bo‘lgan memberlarda attendanceStartDate yo‘q/null bo‘lsa, uni shu ishga tushirish kunining Asia/Tashkent sanasiga qo‘yadi. Mavjud sanalar saqlanadi, attendances yozuvlari yaratilmaydi. Skriptni qayta bajarish oldin sozlangan sanalarni o‘zgartirmaydi; undan keyin ham sozlanmagan member bo‘lsa, o‘sha qayta bajarilgan kun sanasi bilan boshlanadi.

Keyingi birinchi AGENT tayinlash admin member API’sida rol va boshlanish sanasini bitta shartli atomik update’da yozadi. Mavjud boshlanish sanasi, jumladan rol qayta berilganda, saqlanadi. attendanceStartDate public GraphQL output/input’iga kiritilmagan; mijoz uni o‘zgartira olmaydi.

Mahalliy testlar deployment bazasiga ulanmaydi. Haqiqiy MongoDB unique-index/decision concurrency, aggregation, index o‘rnatish va boshlang‘ich skriptni bajarish alohida test/deployment ishidir.
