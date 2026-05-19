from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.security import get_current_user_id, hash_password
from models.order import Order
from models.staff_session import StaffSession
from models.user import User
from schemas.user import UserRead
from schemas.admin import AdminUserRoleUpdate, AdminUserActiveUpdate, AdminUserInfoUpdate


def require_admin( db: Session = Depends(get_db),current_user_id: int = Depends(get_current_user_id),) -> User:
    user = db.get(User, current_user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


@router.get("/health")
def admin_health():
    return {"module": "admin", "status": "ok"}


@router.get("/users", response_model=list[UserRead])
def list_users(db: Session = Depends(get_db)):
    stmt = select(User).order_by(User.id)
    return list(db.scalars(stmt).all())


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user_info(
    user_id: int,
    payload: AdminUserInfoUpdate,
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.username is not None:
        username = payload.username.strip()
        if not username:
            raise HTTPException(status_code=400, detail="Kullanıcı adı boş olamaz")
        existing = db.scalar(select(User).where(User.username == username, User.id != user_id))
        if existing:
            raise HTTPException(status_code=400, detail="Bu kullanıcı adı kullanılıyor")
        user.username = username

    if payload.email is not None:
        email = str(payload.email).strip()
        existing = db.scalar(select(User).where(User.email == email, User.id != user_id))
        if existing:
            raise HTTPException(status_code=400, detail="Bu e-posta kullanılıyor")
        user.email = email

    if payload.password:
        user.password_hash = hash_password(payload.password)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    if user_id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin kendi hesabını silemez",
        )

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    has_orders = db.scalar(select(Order.id).where(Order.created_by == user_id).limit(1))
    if has_orders:
        raise HTTPException(
            status_code=400,
            detail="Bu kullanıcının sipariş geçmişi var. Hesabı silmek yerine kapatın.",
        )

    db.execute(delete(StaffSession).where(StaffSession.user_id == user_id))
    db.delete(user)
    db.commit()
    return None


def _session_end(session: StaffSession, now: datetime) -> datetime:
    return session.logout_at or now


def _hours_between(start: datetime, end: datetime) -> float:
    seconds = max(0.0, (end - start).total_seconds())
    return round(seconds / 3600, 2)


def _hours_for_day(session: StaffSession, day: date, now: datetime) -> float:
    day_start = datetime.combine(day, time.min)
    day_end = day_start + timedelta(days=1)
    start = max(session.login_at, day_start)
    end = min(_session_end(session, now), day_end)
    if end <= start:
        return 0.0
    return _hours_between(start, end)


@router.get("/staff-activity")
def list_staff_activity(db: Session = Depends(get_db)):
    now = datetime.now()
    today = now.date()
    users = list(db.scalars(select(User).order_by(User.id)).all())
    rows = []

    for user in users:
        sessions = list(
            db.scalars(
                select(StaffSession)
                .where(StaffSession.user_id == user.id)
                .order_by(StaffSession.login_at.desc())
            ).all()
        )
        open_session = next((s for s in sessions if s.logout_at is None), None)
        day_hours: dict[date, float] = {}
        day_sessions: dict[date, list[dict]] = {}

        for session in sessions:
            first_day = session.login_at.date()
            last_day = _session_end(session, now).date()
            day = first_day
            while day <= last_day:
                day_start = datetime.combine(day, time.min)
                day_end = day_start + timedelta(days=1)
                start = max(session.login_at, day_start)
                end = min(_session_end(session, now), day_end)
                h = _hours_for_day(session, day, now)
                day_hours[day] = round(day_hours.get(day, 0.0) + h, 2)
                if end >= start:
                    day_sessions.setdefault(day, []).append(
                        {
                            "started_at": start.isoformat(),
                            "ended_at": end.isoformat()
                            if session.logout_at is not None or end < now
                            else None,
                            "start_time": start.strftime("%H:%M"),
                            "end_time": end.strftime("%H:%M")
                            if session.logout_at is not None or end < now
                            else "Devam ediyor",
                            "hours": h,
                            "is_open": session.logout_at is None,
                        }
                    )
                day += timedelta(days=1)

        rows.append(
            {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "is_active": user.is_active,
                "is_online": open_session is not None,
                "active_hours": _hours_between(open_session.login_at, now)
                if open_session
                else 0.0,
                "today_hours": round(day_hours.get(today, 0.0), 2),
                "timeline": [
                    {
                        "date": d.isoformat(),
                        "hours": h,
                        "sessions": day_sessions.get(d, []),
                    }
                    for d, h in sorted(day_hours.items(), reverse=True)
                ],
            }
        )

    return rows


@router.patch("/users/{user_id}/role", response_model=UserRead)
def update_user_role(
    user_id: int,
    payload: AdminUserRoleUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == admin_user.id and payload.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin cannot change their own role to staff",
        )

    user.role = payload.role
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/active", response_model=UserRead)
def update_user_active( user_id: int, payload: AdminUserActiveUpdate, db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user