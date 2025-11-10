#!/bin/bash
# One-off script to migrate database from incorrect location to correct location
# Run this once if your database is in the wrong location

set -e

CORRECT_PATH="/home/calvin/calvin/backend/data/db/calvin.db"
WRONG_PATHS=(
    "/home/calvin/calvin/backend/home/calvin/calvin/backend/data/db/calvin.db"
    "/home/calvin/calvin/backend/data/home/calvin/calvin/backend/data/db/calvin.db"
)

echo "Checking for database in incorrect locations..."

# Check if correct path already exists
if [ -f "$CORRECT_PATH" ]; then
    echo "Database already exists at correct location: $CORRECT_PATH"
    exit 0
fi

# Check for database in wrong locations
for wrong_path in "${WRONG_PATHS[@]}"; do
    if [ -f "$wrong_path" ]; then
        echo "Found database at incorrect location: $wrong_path"
        echo "Migrating to correct location: $CORRECT_PATH"
        
        # Create target directory
        mkdir -p "$(dirname "$CORRECT_PATH")"
        
        # Copy database file
        cp "$wrong_path" "$CORRECT_PATH"
        
        # Set correct permissions
        chown calvin:calvin "$CORRECT_PATH"
        chmod 644 "$CORRECT_PATH"
        
        echo "Database migrated successfully!"
        echo "Old database still exists at: $wrong_path"
        echo "You can manually delete it after verifying the migration worked:"
        echo "  rm $wrong_path"
        
        exit 0
    fi
done

echo "No database found in incorrect locations."
echo "If database exists elsewhere, you can manually copy it to: $CORRECT_PATH"

