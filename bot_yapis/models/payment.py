from sqlalchemy import Column, ForeignKey, Integer, String, DateTime, Boolean, Float
from sqlalchemy.orm import relationship

from app.database import Base

class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    amount = Column(Float, nullable=False)
    method = Column(String, nullable=False)
    status = Column(String, nullable=False,default="pending")
    
    order = relationship("Order", back_populates="payments")
    