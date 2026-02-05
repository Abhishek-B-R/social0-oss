package app

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/Abhishek-B-R/social0/backend/store"
)

type Application struct {
	Logger *log.Logger
	DB *sql.DB
}

func NewApplication() (*Application, error) {
	pgDb, err := store.OpenDatabase()
	if err != nil {
		return nil, err
	}

	logger := log.New(os.Stdout, "", log.Ldate|log.Ltime)

	return &Application{
		Logger: logger,
		DB: pgDb,
	}, nil
}

func (a *Application) HealthCheck(w http.ResponseWriter,r *http.Request){
	fmt.Fprintf(w, "Server is working pretty fine")
}