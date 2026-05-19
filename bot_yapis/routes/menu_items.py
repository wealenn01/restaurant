from fastapi import APIRouter
from sqlalchemy.orm import Session
from sqlalchemy import select
from fastapi import Depends


from app.database import get_db
from models.menu_item import MenuItem
from schemas.menu_item import MenuItemRead,MenuItemCreate,MenuItemUpdate
from fastapi import HTTPException

router = APIRouter(prefix="/menu", tags=["menu_items"])

@router.get("/items",response_model = list[MenuItemRead],summary="menu ogelerini listele",description="bu endpoint menu ogelerini listeler")
def list_menu_items(category_id: int | None = None, db: Session = Depends(get_db)):

    stmt = select(MenuItem).order_by(MenuItem.id)

    if category_id is not None:
        stmt = stmt.where(MenuItem.category_id == category_id)


    return list(db.scalars(stmt).all())


@router.get("/items/{item_id}",response_model = MenuItemRead,summary="menu ogelerini listele",description="bu endpoint menu ogelerini listeler")
def get_menu_item(item_id: int , db : Session = Depends(get_db)):
    item = db.get(MenuItem,item_id)

    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    return item

@router.post("/items",response_model = MenuItemRead,status_code=201,summary="menu ogelerini olustur",description="bu endpoint menu ogelerini olusturur")
def create_menu_item(item: MenuItemCreate, db: Session = Depends(get_db)):
    db_item = MenuItem(**item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@router.put("/items/{item_id}",response_model = MenuItemRead,summary="menu ogelerini guncelle",description="bu endpoint menu ogelerini gunceller")
def update_menu_item(item_id: int , payload : MenuItemUpdate, db: Session = Depends(get_db)):
    item = db.get(MenuItem,item_id)

    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    
    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}",status_code=204,summary="menu ogelerini sil",description="bu endpoint menu ogelerini siler")
def delete_menu_item(item_id: int , db: Session = Depends(get_db)):
    item = db.get(MenuItem,item_id)

    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")
    
    db.delete(item)
    db.commit()


