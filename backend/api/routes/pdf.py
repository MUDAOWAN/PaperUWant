from fastapi import APIRouter

router = APIRouter(prefix="/pdf", tags=["pdf"])


@router.get("/list")
async def list_pdfs():
    """获取 PDF 列表（预留）"""
    return {"pdfs": []}
