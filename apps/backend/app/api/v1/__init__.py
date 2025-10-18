from fastapi import APIRouter

from . import auth, users, groups, expenses, settlements, activity, uploads

router = APIRouter()

router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(users.router, tags=["users"])  # /me endpoints
router.include_router(groups.router, prefix="/groups", tags=["groups"])
router.include_router(expenses.router, prefix="/groups", tags=["expenses"])  # nested under groups
router.include_router(settlements.router, prefix="/groups", tags=["settlements"])  # nested
router.include_router(activity.router, prefix="/groups", tags=["activity"])  # nested
router.include_router(uploads.router, prefix="/uploads", tags=["uploads"])  # receipts
