"""Synthetic demo facility. The 'truth' spec produces the bill; the agents never see it."""
from __future__ import annotations

from . import twin

TRUTH = {
    "name": "Delta Foods (synthetic demo plant)",
    "shift": {"start": 6, "end": 22, "days_per_week": 6},
    "components": [
        {"id": "pumps", "type": "pump", "name": "Process water pumps", "count": 2, "rated_kw": 15.0, "hours": 16, "flow_demand": 0.6, "vsd": False},
        {"id": "air", "type": "compressor", "name": "Air compressor", "rated_kw": 55.0, "hours": 16, "air_demand": 0.5, "leak": 0.25},
        {"id": "lights", "type": "lighting", "name": "Hall lighting (fluorescent)", "kw": 18.0, "hours": 16, "led": False, "after_hours_h": 4},
        {"id": "hvac", "type": "hvac", "name": "Packing-room cooling", "kw": 60.0, "hours": 12, "setpoint_c": 21.0},
        {"id": "belts", "type": "motors", "name": "Conveyors and mixers", "kw": 40.0, "hours": 14, "load_factor": 0.6},
        {"id": "standby", "type": "standby", "name": "Idle equipment left on", "kw": 6.0},
    ],
}

DESCRIPTION = (
    "Small food-processing plant near Cairo. Runs 6 days a week, 6 am to 10 pm. "
    "Two process water pumps (about 15 kW each) with the discharge valve half closed to control flow. "
    "One 55 kW screw air compressor that you can hear hissing from leaks. "
    "Fluorescent hall lights that the night guard leaves on for a few hours after closing. "
    "A 60 kW cooling system for the packing room set to 21 C. "
    "Conveyors and mixers around 40 kW installed. Some machines are left on standby overnight."
)


def case() -> dict:
    bill = round(twin.monthly_kwh(TRUTH), -2)
    return {"description": DESCRIPTION, "bill_kwh": bill, "currency": "EGP", "truth_hidden": True}
