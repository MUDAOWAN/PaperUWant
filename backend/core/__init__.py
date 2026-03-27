# Core module
from .config import settings
from .database import supabase, get_supabase_client

__all__ = ["settings", "supabase", "get_supabase_client"]
