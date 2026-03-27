from fastapi import APIRouter

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/")
async def chat(message: str):
    """聊天接口（预留）"""
    return {"reply": f"收到消息: {message}"}
