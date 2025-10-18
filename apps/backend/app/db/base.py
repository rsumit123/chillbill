# Import models here so Alembic can autogenerate migrations if needed
from app.db.session import Base  # noqa: F401
from app.db.models.user import User  # noqa: F401
from app.db.models.group import Group, GroupMember  # noqa: F401
from app.db.models.expense import Expense, ExpenseSplit  # noqa: F401
from app.db.models.settlement import Settlement  # noqa: F401
from app.db.models.activity import Activity  # noqa: F401
