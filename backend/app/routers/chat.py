"""AgriMind Assistant endpoints (wrapping chatbot.py). The Gemini key never leaves the backend."""

import asyncio
import os
import tempfile
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import auth
from ..config import settings
from ..db import get_db
from ..ml import leaf, loader
from ..models import ChatConversation, ChatMessage, User
from ..schemas import ChatIn
from ..services import assistant
from .common import iso
from .leaf import read_upload

router = APIRouter(prefix="/api/chat", tags=["Assistant"])
limiter = assistant.RateLimiter(settings.chat_rate_limit)

# conversation_id -> Gemini interaction id, for chats that are not stored (guests)
_session_threads: dict[str, str] = {}


def _rate_key(request: Request, user: User | None):
    return f"user:{user.id}" if user else f"ip:{request.client.host if request.client else 'unknown'}"


def _remove(path):
    try:
        os.remove(path)
    except OSError:
        pass


async def _ask(message: str, previous_id: str | None, temp_file: str | None = None):
    def run():
        try:
            return assistant.ask_blocking(message, previous_id)
        finally:  # here, not in the request: after a timeout the worker may still be reading the photo
            if temp_file:
                _remove(temp_file)

    try:
        return await asyncio.wait_for(asyncio.to_thread(run), timeout=settings.chat_timeout_s)
    except asyncio.TimeoutError:
        raise HTTPException(504, {"code": "timeout", "message": "That took too long, please try again."})
    except assistant.AssistantError as e:
        raise HTTPException(e.status, {"code": e.code, "message": e.message, "detail": e.detail})


async def _handle(message: str, conversation_id: str | None, user: User | None, db: Session,
                  temp_file: str | None = None):
    stored = user is not None and not user.is_guest
    conv = None
    previous_id = None
    if conversation_id:
        if stored:
            conv = db.get(ChatConversation, conversation_id)
            if conv is None or conv.user_id != user.id:
                conv = None
            else:
                previous_id = conv.gemini_id
        else:
            previous_id = _session_threads.get(conversation_id)

    reply, gemini_id, tools = await _ask(message, previous_id, temp_file)
    conversation_id = (conv.id if conv else conversation_id) or str(uuid.uuid4())

    if stored:
        if conv is None:
            conv = ChatConversation(id=conversation_id, user_id=user.id, title=message[:120])
            db.add(conv)
        conv.gemini_id = gemini_id
        db.add(ChatMessage(conversation_id=conv.id, role="user", text=message))
        db.add(ChatMessage(conversation_id=conv.id, role="assistant", text=reply, tools_used=tools))
        db.commit()
    elif gemini_id:
        _session_threads[conversation_id] = gemini_id
        if len(_session_threads) > 5000:
            _session_threads.pop(next(iter(_session_threads)))
    return {"reply": reply, "conversation_id": conversation_id, "tools_used": tools, "stored": stored}


@router.post("")
async def chat(body: ChatIn, request: Request,
               user: User | None = Depends(auth.optional_user), db: Session = Depends(get_db)):
    if not limiter.allow(_rate_key(request, user)):
        raise HTTPException(429, {"code": "rate_limited", "message": "Too many messages. Please wait a minute."})
    return await _handle(body.message, body.conversation_id, user, db)


@router.post("/image")
async def chat_image(request: Request, photo: UploadFile = File(...), message: str = Form("", max_length=2000),
                     conversation_id: str | None = Form(None), user: User | None = Depends(auth.optional_user),
                     db: Session = Depends(get_db)):
    """Leaf photo for the assistant: saved to a temporary file for detect_plant_disease, then deleted."""
    if not limiter.allow(_rate_key(request, user)):
        raise HTTPException(429, {"code": "rate_limited", "message": "Too many messages. Please wait a minute."})
    if loader.leaf_unavailable_reason():
        loader.require("leaf")                      # 503 "Leaf model not available online yet."
    data = await read_upload(photo)
    try:
        suffix = await run_in_threadpool(leaf.validate, data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    fd, path = tempfile.mkstemp(suffix=suffix, dir=str(settings.upload_dir))
    with os.fdopen(fd, "wb") as f:
        f.write(data)
    text = (message.strip() or "Please check this leaf photo for disease.")
    prompt = f"{text}\n\n[The user attached a leaf photo saved at: {path}. Use detect_plant_disease on it.]"
    try:
        return await _handle(prompt, conversation_id, user, db, temp_file=path)
    except Exception as e:
        if not (isinstance(e, HTTPException) and e.status_code == 504):
            _remove(path)      # on a timeout the still-running worker deletes it when done
        raise


@router.get("/history")
def history(user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    convs = db.scalars(select(ChatConversation).where(ChatConversation.user_id == user.id)
                       .order_by(ChatConversation.updated_at.desc()).limit(30)).all()
    return {"items": [{"id": c.id, "title": c.title, "updated_at": iso(c.updated_at)} for c in convs],
            "stored": not user.is_guest}


@router.get("/{conversation_id}")
def conversation(conversation_id: str, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    conv = db.get(ChatConversation, conversation_id)
    if conv is None or conv.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    msgs = db.scalars(select(ChatMessage).where(ChatMessage.conversation_id == conv.id)
                      .order_by(ChatMessage.id.asc())).all()
    return {"id": conv.id, "title": conv.title, "messages": [
        {"role": m.role, "text": m.text, "tools_used": m.tools_used or [], "created_at": iso(m.created_at)} for m in msgs]}


@router.delete("/{conversation_id}")
def delete_conversation(conversation_id: str, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    conv = db.get(ChatConversation, conversation_id)
    if conv is None or conv.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    db.delete(conv)
    db.commit()
    return {"ok": True}
