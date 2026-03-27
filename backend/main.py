from datetime import datetime
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.database import supabase
from api.routes import chat, pdf

app = FastAPI(
    title="PaperUWant API",
    version="0.1.0",
    description="AI 学术助手后端服务",
)

# CORS 配置：允许前端 Next.js 跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(chat.router)
app.include_router(pdf.router)


@app.get("/")
def root():
    return {"status": "ok", "message": "PaperUWant API is running"}


@app.get("/api/health")
def health_check():
    """健康检查接口"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "supabase_connected": supabase is not None,
    }
