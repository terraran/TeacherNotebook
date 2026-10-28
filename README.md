# สมุดครู

เว็บแอปจัดการการสอนส่วนตัว (ICT Y3–Y4 + สอนพิเศษ) · HTML/JS ล้วน ไม่ต้อง build · วางบน GitHub Pages · ข้อมูลอยู่ใน Google Sheet ผ่าน Apps Script · เข้าสู่ระบบด้วย Google

## สถานะ

- [x] เฟส 1: โครงข้อมูล · นำเข้าไฟล์ตั้งต้น · หน้าแรก (Bento) · ปฏิทินสัปดาห์/เดือน · ตั้งค่า
- [ ] เฟส 2: หน้าสอนพิเศษ (บันทึกผล, หน้าเตรียมสอน, กราฟคะแนน)
- [ ] เฟส 3: ICT PMI · ประวัติ · ส่งออก .xlsx

## ลองในเครื่อง

ถ้า `sheetsUrl` ใน `js/config.js` ยังว่าง แอปจะทำงานแบบ **โหมดในเครื่อง** ข้อมูลอยู่ในเบราว์เซอร์นั้นเท่านั้น

```bash
python -m http.server 5173
```

เปิด http://localhost:5173 แล้วเลือกไฟล์ `สมุดครู_ข้อมูลตั้งต้น.xlsx`

## ตั้งค่า Google Sheet (ให้มือถือกับคอมใช้ข้อมูลเดียวกัน)

1. สร้าง Google Sheet เปล่า ตั้งชื่อเช่น `สมุดครู — ข้อมูล` (ไม่ต้องสร้างแท็บเอง แอปสร้างให้ตอนนำเข้า)
2. ในชีต: **ส่วนขยาย → Apps Script** → ลบโค้ดเดิม → วางทั้งไฟล์ `apps-script/Code.gs`
3. แก้ 2 บรรทัดบนสุดในตัวแก้ของ Apps Script (ไม่ต้องแก้ใน repo):
   - `OWNER_EMAIL` = อีเมล Google ของคุณ (บัญชีเดียวที่เข้าได้)
   - `GOOGLE_CLIENT_ID` = ค่าเดียวกับ `googleClientId` ใน `js/config.js`
4. **Deploy → New deployment → Web app**
   - Execute as: **Me** · Who has access: **Anyone**
   - กด Authorize ตามขั้นตอน → คัดลอก **Web app URL** (ลงท้าย `/exec`)
5. วาง URL ลงใน `js/config.js` ที่ `sheetsUrl`
6. Client ID: ตอนนี้ใช้ตัวเดียวกับแอปพิมพ์ดีด (โปรเจกต์ Google Cloud ของคุณ) ซึ่งมี `https://terraran.github.io` อยู่แล้ว
   ถ้าจะลองบนเครื่องด้วย ให้เพิ่ม `http://localhost:5173` ใน **Google Cloud Console → APIs & Services → Credentials → OAuth client → Authorized JavaScript origins**
   (หรือสร้าง Client ID ใหม่แยกก็ได้ แล้วแก้ทั้ง `js/config.js` และ `Code.gs`)
7. เปิดแอป → เข้าสู่ระบบด้วย Google → เลือกไฟล์ xlsx เพื่อนำเข้าครั้งแรก → แท็บต่างๆ จะขึ้นในชีต

แก้ `Code.gs` ภายหลัง: **Deploy → Manage deployments → แก้ (ดินสอ) → Version: New version → Deploy** URL เดิมใช้ต่อได้

**ความปลอดภัย:** ทุกคำขอต้องมี Google ID token ของ `OWNER_EMAIL` · Apps Script ตรวจกับ Google ทุกครั้ง (cache ไว้จนโทเค็นหมดอายุ) · ลิงก์ Web app หลุดไปก็อ่านข้อมูลไม่ได้

**ข้อจำกัด:** บันทึกแต่ละครั้งใช้ ~1–3 วินาที (ขึ้น "กำลังบันทึก…" มุมขวาบน) · ไม่ซิงก์สด เครื่องอื่นเห็นการแก้เมื่อเปิดหรือสลับกลับมาที่แอป · ไม่มีเน็ตดูข้อมูลล่าสุดได้แต่บันทึกไม่ได้ · ถ้าแก้ในชีตตรงๆ ให้กด "โหลดจากชีตใหม่" ในหน้าตั้งค่า

## เปิดบน GitHub Pages

repo: `terraran/TeacherNotebook` → **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save**
แอปจะอยู่ที่ https://terraran.github.io/TeacherNotebook/

## ข้อมูลส่วนตัว

ไฟล์ `.xlsx` และโฟลเดอร์ `dev/` ถูกกันไว้ใน `.gitignore` · repo เป็นสาธารณะ อย่า commit ไฟล์ข้อมูลนักเรียนหรืออีเมลลง repo

## โครงข้อมูล (แต่ละหมวด = 1 แท็บในชีต · แถว 1 = ชื่อฟิลด์ · คอลัมน์ A = id)

| คีย์ | เนื้อหา |
|---|---|
| `settings/terms`, `settings/types`, `settings/specialDays` | ภาคเรียน · ประเภทกิจกรรม (สี, แสดงเฉพาะเปิดเทอมไหม) · วันพิเศษ |
| `recurring` | รายการประจำรายสัปดาห์ (`dow` 0=อาทิตย์) ผูกกับ `roomId`/`group` หรือ `studentId` · `background: true` = แถบเวลางาน |
| `events` | รายการที่เพิ่มเอง · `repeat: none \| weekly` · `until` |
| `rooms`, `lostPeriods`, `ictPlan` | ห้อง ICT · คาบที่เสีย (`confirmed`) · แผนรายสัปดาห์ |
| `students`, `history` | นักเรียนพิเศษ (`status: active \| paused`) · ประวัติย้อนหลัง |
| `quickNote`, `meta` | โน้ตด่วน · วันที่นำเข้า (แท็บ ค่าอื่นๆ) |

ช่องที่ยังรอยืนยันมี `unconfirmed` กำกับ

## กติกาปฏิทิน

- รายการอยู่ในช่วงที่ **เวลาเริ่ม** ตกอยู่ (เช้า 07–12 · บ่าย 12–16 · ค่ำ 16–19 · ดึก 19–24) · 00:00–07:00 ไม่อยู่ในช่วงใด
- ประเภทสอนที่โรงเรียน / ชมรม / เวร แสดงเฉพาะวันในภาคเรียน · สอนพิเศษและส่วนตัวแสดงทุกสัปดาห์
- คาบที่เสียที่ยืนยันแล้วจะไม่แสดง · ที่รอยืนยันจะขีดฆ่าไว้
- นักเรียนที่ **พักไว้** ไม่แสดงในปฏิทินและหน้าแรก
