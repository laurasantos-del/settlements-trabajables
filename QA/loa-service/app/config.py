from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    hs_api_key: str = ""
    hs_webhook_secret: str = ""
    hs_portal_id: str = ""
    hs_inbox_cs_email: str = ""
    hs_inbox_set: str = ""

    dm_base_url: str = ""
    dm_api_key: str = ""

    ls_username: str = ""
    ls_password: str = ""
    ls_base_url: str = ""

    directory_mode: str = "sheets"
    sheets_id: str = ""
    sheets_api_key: str = ""
    db_url: str = ""

    service_host: str = "0.0.0.0"
    service_port: int = 8000
    postal_queue_webhook: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
