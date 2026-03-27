import os
import warnings
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用全局配置，从 .env 文件加载"""

    supabase_url: str = ""
    supabase_anon_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._validate()

    def _validate(self):
        """安全检查：确保关键配置项存在"""
        missing = []
        if not self.supabase_url:
            missing.append("SUPABASE_URL")
        if not self.supabase_anon_key:
            missing.append("SUPABASE_ANON_KEY")

        if missing:
            raise ValueError(
                f"缺少必需的环境变量: {', '.join(missing)}。"
                f"请在 backend/.env 文件中配置这些变量。"
            )


# 全局单例
settings = Settings()
