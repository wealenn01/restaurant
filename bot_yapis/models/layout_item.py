from sqlalchemy import Column, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class LayoutItem(Base):
    __tablename__ = "layout_items"

    id = Column(Integer, primary_key=True, index=True)
    floor_id = Column(Integer, ForeignKey("floors.id"), nullable=False, index=True)
    type = Column(String, nullable=False)
    x = Column(Float, nullable=False, default=0)
    y = Column(Float, nullable=False, default=0)
    width = Column(Float, nullable=False, default=80)
    height = Column(Float, nullable=False, default=80)
    rotation = Column(Float, nullable=False, default=0)
    label = Column(String, nullable=True)
    table_id = Column(Integer, ForeignKey("tables.id"), nullable=True, index=True)

    floor = relationship("Floor", back_populates="layout_items")
    table = relationship("Table")
