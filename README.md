# 🧾 Chillbill

**Chillbill** is a modern, minimal, and responsive expense-sharing web application — a **Splitwise clone** — built to make splitting bills and tracking shared expenses effortless.  

We're starting with a **web application** in **Version 1**, with plans to migrate to a **mobile APK** in future releases.  

---

## 🚀 Project Goals

- Build a seamless, collaborative platform for managing shared expenses
- Focus on intuitive UX and clean, creative UI (mobile-first design)
- Ensure scalability and maintainability for mobile platform migration

---

## 🛠️ Tech Stack

| Layer        | Technology                  |
|--------------|------------------------------|
| Frontend     | React (with TypeScript), TailwindCSS |
| Backend      | FastAPI (Python)             |
| Database     | PostgreSQL                   |
| Deployment   | Docker, GitHub Actions (CI/CD), Fly.io or Render (TBD) |

---

## 🎨 UI/UX Design Principles

- **Modern, clean, and creative UI** (not a Spotify clone)
- **Mobile-first & fully responsive**
- **Dark/light theme support**
- **User-centric flows** for adding, splitting, and settling expenses

---

## 📦 Features (v1.0)

- ✅ User authentication (sign up, login, logout)
- ✅ Create groups or one-off splits
- ✅ Add expenses with descriptions, amounts, and participants
- ✅ View balances and how much each person owes
- ✅ Settle up with friends (mark as paid)
- 🚧 Simple notifications (email or in-app)
- 🚧 Activity log / history of expenses

---

## 📲 Mobile App (Coming Soon)

Once the web version is stable, we plan to develop a cross-platform **mobile APK** using **React Native** or **Flutter**. The backend and DB will remain the same (API-first architecture).

---

## 🧪 Development Setup

### Prerequisites

- Python 3.10+
- PostgreSQL 14+
- Docker (optional but recommended)

### Backend Setup (FastAPI)

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
