from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    bot_token: str = ""
    bot_username: str = ""
    webapp_url: str = ""
    admin_ids: str = ""
    secret_key: str = "change-this-secret"
    database_url: str = "sqlite:///./ghg_empire.db"
    ton_receive_address: str = ""
    toncenter_api_key: str = ""
    ton_verify_amount_nano: int = 50_000_000
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def admins(self):
        return {int(x.strip()) for x in self.admin_ids.split(",") if x.strip().isdigit()}

settings = Settings()
