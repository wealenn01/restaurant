import os
from fastapi import FastAPI
from fastapi import Depends
from fastapi.middleware.cors import CORSMiddleware

import models
from app.database import Base, engine
from routes.auth import router as auth_router
from routes.menu_items import router as menu_router
from routes.orders import router as orders_router
from routes.tables import router as tables_router
from routes.payments import router as payments_router
from routes.categories import router as categories_router
from routes.order_items import router as order_items_router
from app.security import get_current_user_id
from routes.admin import router as admin_router
from routes.layout import router as layout_router


app = FastAPI(title = "Restaurant API",
    version = "1.0.0",
    description = "Restaurant order management backend",
)
_default_origins = (
    "http://localhost,http://127.0.0.1,"
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:5174,http://127.0.0.1:5174,"
    "http://localhost:4173,http://127.0.0.1:4173"
)
_cors = os.getenv("CORS_ORIGINS", _default_origins)
_cors_list = [o.strip() for o in _cors.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(menu_router, dependencies=[Depends(get_current_user_id)])
app.include_router(orders_router, dependencies=[Depends(get_current_user_id)])
app.include_router(order_items_router, dependencies=[Depends(get_current_user_id)])
app.include_router(tables_router, dependencies=[Depends(get_current_user_id)])
app.include_router(payments_router, dependencies=[Depends(get_current_user_id)])
app.include_router(categories_router, dependencies=[Depends(get_current_user_id)])
app.include_router(admin_router, dependencies=[Depends(get_current_user_id)])
app.include_router(layout_router, dependencies=[Depends(get_current_user_id)])


@app.on_event("startup")
def create_missing_tables():
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {"message": "Restaurant API is running"}
