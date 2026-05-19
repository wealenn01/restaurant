from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy.orm import relationship

from app.database import Base

class Table(Base):
    __tablename__ = "tables"

    id = Column(Integer, primary_key=True, index=True)
    number = Column(Integer, unique=True, index=True, nullable=False)
    capacity = Column(Integer, nullable=False,default=4)
    status = Column(String, nullable=False, default="empty")


    orders = relationship("Order", back_populates="table")

 