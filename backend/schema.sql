-- AgriMind MySQL schema (generated from backend/app/models.py).
-- The backend also creates missing tables automatically on startup.
-- Setup:
--   CREATE DATABASE agrimind CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--   CREATE USER 'agrimind'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
--   GRANT ALL PRIVILEGES ON agrimind.* TO 'agrimind'@'localhost';
--   USE agrimind; SOURCE schema.sql;

CREATE TABLE users (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	username VARCHAR(64), 
	password_hash VARCHAR(255), 
	is_guest BOOL NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE auth_sessions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	token_hash VARCHAR(64) NOT NULL, 
	created_at DATETIME NOT NULL, 
	expires_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	UNIQUE (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_auth_sessions_user_id ON auth_sessions (user_id);

CREATE TABLE chat_conversations (
	id VARCHAR(36) NOT NULL, 
	user_id INTEGER NOT NULL, 
	gemini_id VARCHAR(255), 
	title VARCHAR(120) NOT NULL, 
	created_at DATETIME NOT NULL, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_chat_conversations_user_id ON chat_conversations (user_id);

CREATE TABLE crop_production_records (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	crop VARCHAR(80) NOT NULL, 
	season VARCHAR(20) NOT NULL, 
	crop_year INTEGER NOT NULL, 
	area_ha FLOAT NOT NULL, 
	state VARCHAR(80), 
	district VARCHAR(80), 
	sowing_date DATE, 
	harvest_date DATE, 
	actual_production_t FLOAT, 
	estimated_production_t FLOAT, 
	notes TEXT, 
	updated_at DATETIME NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_crop_production_records_created_at ON crop_production_records (created_at);
CREATE INDEX ix_crop_production_records_user_id ON crop_production_records (user_id);

CREATE TABLE crop_recommendations (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	crop VARCHAR(40) NOT NULL, 
	confidence FLOAT NOT NULL, 
	top JSON NOT NULL, 
	inputs JSON NOT NULL, 
	assumed JSON NOT NULL, 
	warnings JSON NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_crop_recommendations_created_at ON crop_recommendations (created_at);
CREATE INDEX ix_crop_recommendations_user_id ON crop_recommendations (user_id);

CREATE TABLE farmer_profiles (
	user_id INTEGER NOT NULL, 
	display_name VARCHAR(80), 
	state VARCHAR(80), 
	district VARCHAR(80), 
	farm_area_ha FLOAT, 
	soil_type VARCHAR(20), 
	area_unit VARCHAR(10) NOT NULL, 
	weight_unit VARCHAR(10) NOT NULL, 
	common_crops JSON, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE irrigation_records (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	crop VARCHAR(40) NOT NULL, 
	growth_stage VARCHAR(20) NOT NULL, 
	season VARCHAR(20) NOT NULL, 
	soil_moisture_pct FLOAT NOT NULL, 
	soil_moisture_source VARCHAR(20) NOT NULL, 
	need VARCHAR(10) NOT NULL, 
	advice VARCHAR(255) NOT NULL, 
	inputs JSON NOT NULL, 
	assumed JSON NOT NULL, 
	warnings JSON NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_irrigation_records_user_id ON irrigation_records (user_id);
CREATE INDEX ix_irrigation_records_created_at ON irrigation_records (created_at);

CREATE TABLE leaf_predictions (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	raw_class VARCHAR(120) NOT NULL, 
	plant VARCHAR(60) NOT NULL, 
	`condition` VARCHAR(120) NOT NULL, 
	is_healthy BOOL NOT NULL, 
	confidence FLOAT NOT NULL, 
	top_predictions JSON NOT NULL, 
	thumbnail TEXT, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_leaf_predictions_user_id ON leaf_predictions (user_id);
CREATE INDEX ix_leaf_predictions_created_at ON leaf_predictions (created_at);

CREATE TABLE market_price_estimates (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	state VARCHAR(80) NOT NULL, 
	district VARCHAR(80) NOT NULL, 
	market VARCHAR(120) NOT NULL, 
	commodity VARCHAR(120) NOT NULL, 
	variety VARCHAR(120) NOT NULL, 
	grade VARCHAR(20) NOT NULL, 
	price_per_quintal FLOAT NOT NULL, 
	range_low FLOAT NOT NULL, 
	range_high FLOAT NOT NULL, 
	warnings JSON NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_market_price_estimates_user_id ON market_price_estimates (user_id);
CREATE INDEX ix_market_price_estimates_created_at ON market_price_estimates (created_at);

CREATE TABLE production_estimates (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	state VARCHAR(80) NOT NULL, 
	district VARCHAR(80) NOT NULL, 
	season VARCHAR(20) NOT NULL, 
	crop VARCHAR(80) NOT NULL, 
	crop_year INTEGER NOT NULL, 
	area_ha FLOAT NOT NULL, 
	yield_t_per_ha FLOAT NOT NULL, 
	production_t FLOAT NOT NULL, 
	note VARCHAR(255), 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_production_estimates_created_at ON production_estimates (created_at);
CREATE INDEX ix_production_estimates_user_id ON production_estimates (user_id);

CREATE TABLE user_activity (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	user_id INTEGER NOT NULL, 
	kind VARCHAR(20) NOT NULL, 
	title VARCHAR(160) NOT NULL, 
	detail VARCHAR(255), 
	link VARCHAR(80), 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_user_activity_created_at ON user_activity (created_at);
CREATE INDEX ix_activity_user_created ON user_activity (user_id, created_at);

CREATE TABLE chat_messages (
	id INTEGER NOT NULL AUTO_INCREMENT, 
	conversation_id VARCHAR(36) NOT NULL, 
	`role` VARCHAR(10) NOT NULL, 
	text TEXT NOT NULL, 
	tools_used JSON, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX ix_chat_messages_conversation_id ON chat_messages (conversation_id);
CREATE INDEX ix_chat_messages_created_at ON chat_messages (created_at);
