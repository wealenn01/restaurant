from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.database import get_db
from models.category import Category
from models.menu_item import MenuItem


from schemas.category import CategoryCreate, CategoryRead, CategoryUpdate

router = APIRouter(prefix="/categories", tags=["categories"])

@router.get("/",response_model=list[CategoryRead])
def list_categories(db: Session = Depends(get_db)):
    stmt = select(Category).order_by(Category.position,Category.id)
    return list(db.scalars(stmt).all())


@router.get("/{category_id}",response_model=CategoryRead)
def get_category(category_id: int, db: Session = Depends(get_db)):
    category = db.get(Category, category_id)

    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    return category

@router.post("/",response_model=CategoryRead,status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    category = Category(**payload.model_dump())
    db.add(category)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
             detail="Failed to create category"
        )
    db.refresh(category)
    return category

@router.patch("/{category_id}",response_model=CategoryRead)
def update_category(category_id: int, payload: CategoryUpdate, db: Session = Depends(get_db)):
    db_category = db.get(Category, category_id)

    if not db_category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
   
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(db_category, field, value)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update category"
        )
    db.refresh(db_category)
    return db_category


@router.delete("/{category_id}",status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    db_category = db.get(Category, category_id)

    if not db_category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    n_items = db.scalar(select(func.count()).select_from(MenuItem).where(MenuItem.category_id == category_id)
    )

    if n_items and n_items>0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot delete category with menu items")

    db.delete(db_category)
    db.commit()
    return None
    