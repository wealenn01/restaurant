from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.security import create_access_token, verify_password, get_current_user_id
from schemas.auth import Token

from app.database import get_db
from app.security import hash_password
from models.staff_session import StaffSession
from models.user import User
from schemas.user import UserCreate,UserRead,UserLogin

router = APIRouter(prefix = "/auth",tags = ["auth"])

@router.get("/health")
def auth_health():
    return {"module":"auth","status":"ok"}


@router.get("/me", response_model=UserRead, summary="oturumdaki kullanıcı")
def read_current_user(
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    user = db.get(User, current_user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/register", response_model = UserRead,status_code=201,summary="kullanıcı oluştur",description="bu endpoint kullanıcı oluşturur")
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing_username = db.scalar(select(User).where(User.username == payload.username))

    if existing_username:
        raise HTTPException(status_code=400, detail="Username already exists")
    
    existing_email = db.scalar(select(User).where(User.email == payload.email))

    if existing_email:
        raise HTTPException(status_code=400, detail="Email already exists")

    # Veritabanında hiç admin yoksa bu kayıt admin olur (ilk kullanıcı staff olsa bile).
    admin_count = (
        db.scalar(select(func.count()).select_from(User).where(User.role == "admin"))
        or 0
    )
    role = "admin" if admin_count == 0 else "staff"

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=role,
        is_active=True
    )

    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login",response_model = Token,summary="kullanıcı girişi",description="bu endpoint kullanıcı girişi yapar")
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))

    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    if not verify_password(plain_password=payload.password, hashed_password=user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")

    if user.role == "staff":
        open_session = db.scalar(
            select(StaffSession).where(
                StaffSession.user_id == user.id,
                StaffSession.logout_at.is_(None),
            )
        )
        if not open_session:
            db.add(StaffSession(user_id=user.id, login_at=datetime.now()))
            db.commit()
    
    access_token = create_access_token(data=str(user.id))


    return {"access_token": access_token, "token_type": "bearer", "role": user.role}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    db: Session = Depends(get_db),
    current_user_id: int = Depends(get_current_user_id),
):
    open_session = db.scalar(
        select(StaffSession)
        .where(
            StaffSession.user_id == current_user_id,
            StaffSession.logout_at.is_(None),
        )
        .order_by(StaffSession.login_at.desc())
    )
    if open_session:
        open_session.logout_at = datetime.now()
        db.commit()
    return None