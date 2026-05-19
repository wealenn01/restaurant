from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Integer
from sqlalchemy.orm import relationship

from app.database import Base


class StaffSession(Base):
    __tablename__ = "staff_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    login_at = Column(DateTime, default=datetime.now, nullable=False)
    logout_at = Column(DateTime, nullable=True)

    user = relationship("User")
