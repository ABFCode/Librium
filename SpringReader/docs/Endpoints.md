# API Endpoint Documentation

**Base URL:** Determined by `VITE_API_URL`
**Authentication:** Most endpoints require the `jwt` cookie. Use `credentials: 'include'` in frontend fetch calls.

---

## User Authentication (`/api/user`)

**Register User:**
Endpoint: `/user/register`
Method: POST
Auth Required: No
Request Body: JSON `{ "username": "...", "password": "..." }`


**Login User:**
Endpoint: `/user/login`
Method: POST
Auth Required: No
Request Body: JSON `{ "username": "...", "password": "..." }`


**Logout User:**
Endpoint: `/user/logout`
Method: POST
Auth Required: Yes
Request Body: None

**Validate Session:**
Endpoint: `/user/validate`
Method: GET
Auth Required: Yes
Request Body: None


---

## Library Management (`/api/library`)

**Get User's Library:**
Endpoint: `/library`
Method: GET
Auth Required: Yes
Request Body: None


**Upload Book (EPUB):**
Endpoint: `/library/upload`
Method: POST
Auth Required: Yes
Request Body: FormData with `file` field containing the EPUB file


---

## EPUB Reading (`/api/epub`)

**Get Book Metadata:**
Endpoint: `/epub/{bookId}/meta`
Method: GET
Auth Required: Yes
Request Body: None


**Get Chapter Content:**
Endpoint: `/epub/{bookId}/chapter/{index}`
Method: GET
Auth Required: Yes
Request Body: None


---

## Reading Progress (`/api/progress`)

**Save Progress:**
Endpoint: `/progress/save`
Method: POST
Auth Required: Yes
Request Body: JSON `UserBookProgressDTO { bookId: number, lastChapterIndex: number }`


**Get Progress:**
Endpoint: `/progress/get?bookId={bookId}`
Method: GET
Auth Required: Yes
Request Body: None


---

## Cover Images (`/api/covers`)

**Get Cover Image:**
Endpoint: `/covers/{filename}`
Method: GET
Auth Required: Yes
Request Body: None


---

