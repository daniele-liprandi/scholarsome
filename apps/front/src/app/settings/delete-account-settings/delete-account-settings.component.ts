import { Component } from "@angular/core";
import { NgForm } from "@angular/forms";
import { ApiResponseOptions } from "@scholarsome/shared";
import { UsersService } from "../../shared/http/users.service";
import { Router } from "@angular/router";

@Component({
  selector: "scholarsome-delete-account-settings",
  templateUrl: "./delete-account-settings.component.html",
  styleUrls: []
})
export class DeleteAccountSettingsComponent {
  constructor(
    private readonly usersService: UsersService,
    private readonly router: Router
  ) {}

  protected clicked = false;
  protected confirmed = false;
  protected error = false;
  protected invalidPassword = false;

  async submit(form: NgForm) {
    this.clicked = true;
    this.error = false;
    this.invalidPassword = false;

    const result = await this.usersService.deleteMe(form.value["password"]);

    this.clicked = false;

    switch (result) {
      case ApiResponseOptions.Success:
        await this.router.navigate(["/"]);
        break;
      case ApiResponseOptions.Incorrect:
        this.invalidPassword = true;
        break;
      default:
        this.error = true;
        break;
    }
  }
}
