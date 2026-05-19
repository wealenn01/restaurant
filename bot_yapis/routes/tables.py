from fastapi import APIRouter,Depends
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.database import get_db
from models.table import Table
from schemas.table import TableRead,TableCreate,TableUpdate
from fastapi import HTTPException

router = APIRouter(prefix="/tables", tags=["tables"])


@router.get("/health")
def tables_health():
    return {"module": "tables", "status": "ok"}


@router.get("/", response_model = list[TableRead],summary="tables listesi",description="bu endpoint tables listesini döner")
def get_tables(db: Session = Depends(get_db),status: str | None = None):
  
    stmt = select(Table).order_by(Table.number)

    if status is not None:
        stmt = stmt.where(Table.status == status)
    
    return list(db.scalars(stmt).all())

@router.get("/{table_id}", response_model = TableRead,summary="table detayı",description="bu endpoint table detayını döner")
def get_table(table_id: int, db: Session = Depends(get_db)):

    table = db.get(Table, table_id)

    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    return table

@router.post("/", response_model = TableRead,status_code = 201,summary="table oluştur",description="bu endpoint table oluşturur")
def create_table(payload: TableCreate, db: Session = Depends(get_db)):
    
    db_table = Table(**payload.model_dump())
  
    db.add(db_table)
    db.commit()
    db.refresh(db_table)
    return db_table

@router.put("/{table_id}", response_model = TableRead,summary="table güncelle",description="bu endpoint table günceller")
def update_table(table_id: int, payload: TableUpdate, db: Session = Depends(get_db)):

    table = db.get(Table, table_id)

    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(table, field, value)

    db.commit()
    db.refresh(table)
    return table

@router.delete("/{table_id}", status_code=204,summary="table sil",description="bu endpoint table siler")
def delete_table(table_id: int, db: Session = Depends(get_db)):

    table = db.get(Table, table_id)

    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    db.delete(table)
    db.commit()
    return None

