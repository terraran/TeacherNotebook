# สมุดครู

เว็บแอปจัดการการสอนส่วนตัว (ICT Y3–Y4 + สอนพิเศษ) · HTML/JS ล้วน ไม่ต้อง build · วางบน GitHub Pages · ข้อมูลอยู่ใน Firebase Realtime Database

## สถานะ

- [x] เฟส 1: โครงข้อมูล · นำเข้าไฟล์ตั้งต้น · หน้าแรก (Bento) · ปฏิทินสัปดาห์/เดือน · ตั้งค่า
- [ ] เฟส 2: หน้าสอนพิเศษ (บันทึกผล, หน้าเตรียมสอน, กราฟคะแนน)
- [ ] เฟส 3: ICT PMI · ประวัติ · ส่งออก .xlsx

## ลองในเครื่อง (ยังไม่ต้องมี Firebase)

ถ้า `js/firebase-config.js` ยังเป็น `null` แอปจะทำงานแบบ **โหมดในเครื่อง** ข้อมูลอยู่ในเบราว์เซอร์นั้นเท่านั้น

```bash
python -m http.server 5173
```

เปิด http://localhost:5173 แล้วเลือกไฟล์ `สมุดครู_ข้อมูลตั้งต้น.xlsx`

## ตั้งค่า Firebase (ให้มือถือกับคอมใช้ข้อมูลเดียวกัน)

1. ไปที่ https://console.firebase.google.com → **Add project** (แนะนำสร้างโปรเจกต์ใหม่ แยกจาก thai-typing)
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**
3. **Build → Realtime Database → Create database** เลือก location `asia-southeast1` → เริ่มแบบ **locked mode**
4. แท็บ **Rules** ของ Realtime Database → วางเนื้อหาจาก `database.rules.json` → **Publish**
   (ให้แต่ละบัญชีอ่าน/เขียนได้เฉพาะ `/users/<uid ของตัวเอง>`)
5. **Project settings → Your apps → Web (</>)** → ตั้งชื่อ → คัดลอก `firebaseConfig`
6. วางลงใน `js/firebase-config.js` แทน `null`:

   ```js
   export const firebaseConfig = {
     apiKey: '…',
     authDomain: '….firebaseapp.com',
     databaseURL: 'https://…-default-rtdb.asia-southeast1.firebasedatabase.app',
     projectId: '…',
     appId: '…',
   };
   ```

   ค่าพวกนี้เปิดเผยได้ ความปลอดภัยอยู่ที่ Rules ในข้อ 4
7. **Authentication → Settings → Authorized domains** → เพิ่ม `terraran.github.io`
8. เปิดแอป → เข้าสู่ระบบด้วย Google → เลือกไฟล์ xlsx เพื่อนำเข้าครั้งแรก

## ข้อมูลส่วนตัว

ไฟล์ `.xlsx` ถูกกันไว้ใน `.gitignore` · อย่า commit ไฟล์ข้อมูลนักเรียนลง repo สาธารณะ

## โครงข้อมูล (`/users/<uid>`)

| คีย์ | เนื้อหา |
|---|---|
| `settings/terms`, `settings/types`, `settings/specialDays` | ภาคเรียน · ประเภทกิจกรรม (สี, แสดงเฉพาะเปิดเทอมไหม) · วันพิเศษ |
| `recurring` | รายการประจำรายสัปดาห์ (`dow` 0=อาทิตย์) ผูกกับ `roomId`/`group` หรือ `studentId` · `background: true` = แถบเวลางาน |
| `events` | รายการที่เพิ่มเอง · `repeat: none \| weekly` · `until` |
| `rooms`, `lostPeriods`, `ictPlan` | ห้อง ICT · คาบที่เสีย (`confirmed`) · แผนรายสัปดาห์ |
| `students`, `history` | นักเรียนพิเศษ (`status: active \| paused`) · ประวัติย้อนหลัง |
| `quickNote`, `meta` | โน้ตด่วน · วันที่นำเข้า |

ช่องที่ยังรอยืนยันมี `unconfirmed` กำกับ

## กติกาปฏิทิน

- รายการอยู่ในช่วงที่ **เวลาเริ่ม** ตกอยู่ (เช้า 07–12 · บ่าย 12–16 · ค่ำ 16–19 · ดึก 19–24) · 00:00–07:00 ไม่อยู่ในช่วงใด
- ประเภทสอนที่โรงเรียน / ชมรม / เวร แสดงเฉพาะวันในภาคเรียน · สอนพิเศษและส่วนตัวแสดงทุกสัปดาห์
- คาบที่เสียที่ยืนยันแล้วจะไม่แสดง · ที่รอยืนยันจะขีดฆ่าไว้
- นักเรียนที่ **พักไว้** ไม่แสดงในปฏิทินและหน้าแรก
