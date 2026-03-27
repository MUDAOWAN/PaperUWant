from supabase import create_client, Client
from .config import settings


def get_supabase_client() -> Client:
    """获取 Supabase 客户端单例"""
    return create_client(
        supabase_url=settings.supabase_url,
        supabase_key=settings.supabase_anon_key,
    )


# 全局客户端实例
supabase: Client = get_supabase_client()
